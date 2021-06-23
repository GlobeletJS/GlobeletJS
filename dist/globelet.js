function getExtendedContext(canvas) {
  const haveCanvas = canvas instanceof Element;
  if (!haveCanvas || canvas.tagName.toLowerCase() !== "canvas") {
    throw Error("ERROR in yawgl.getExtendedContext: not a valid Canvas!");
  }
  const gl = canvas.getContext("webgl");

  // developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
  //   #Take_advantage_of_universally_supported_WebGL_1_extensions
  const universalExtensions = [
    "ANGLE_instanced_arrays",
    "EXT_blend_minmax",
    "OES_element_index_uint",
    "OES_standard_derivatives",
    "OES_vertex_array_object",
    "WEBGL_debug_renderer_info",
    "WEBGL_lose_context"
  ];
  universalExtensions.forEach(ext => getAndApplyExtension(gl, ext));

  // Modify the shaderSource method to add a preamble
  const SHADER_PREAMBLE = `
#extension GL_OES_standard_derivatives : enable
#line 1
`;
  const shaderSource = gl.shaderSource;
  gl.shaderSource = function(shader, source) {
    const modified = (source.indexOf("GL_OES_standard_derivatives") < 0)
      ? SHADER_PREAMBLE + source
      : source;
    shaderSource.call(gl, shader, modified);
  };

  return gl;
}

function getAndApplyExtension(gl, name) {
  // https://webgl2fundamentals.org/webgl/lessons/webgl1-to-webgl2.html
  const ext = gl.getExtension(name);
  if (!ext) return console.log("yawgl: extension " + name + " not supported!");

  const fnSuffix = name.split("_")[0];
  const enumSuffix = '_' + fnSuffix;

  for (const key in ext) {
    const value = ext[key];
    const isFunc = typeof value === 'function';
    const suffix = isFunc ? fnSuffix : enumSuffix;
    const glKey = (key.endsWith(suffix))
      ? key.substring(0, key.length - suffix.length)
      : key;
    if (gl[glKey] !== undefined) {
      if (!isFunc && gl[glKey] !== value) {
        console.warn("conflict:", name, gl[glKey], value, key);
      }
    } else if (isFunc) {
      gl[glKey] = (function(origFn) {
        return function() {
          return origFn.apply(ext, arguments);
        };
      })(value);
    } else {
      gl[glKey] = value;
    }
  }
}

function createUniformSetter(gl, program, info, textureUnit) {
  const { name, type, size } = info;
  const isArray = name.endsWith("[0]");
  const loc = gl.getUniformLocation(program, name);

  switch (type) {
    case gl.FLOAT:
      return (isArray)
        ? (v) => gl.uniform1fv(loc, v)
        : (v) => gl.uniform1f(loc, v);
    case gl.FLOAT_VEC2:
      return (v) => gl.uniform2fv(loc, v);
    case gl.FLOAT_VEC3:
      return (v) => gl.uniform3fv(loc, v);
    case gl.FLOAT_VEC4:
      return (v) => gl.uniform4fv(loc, v);
    case gl.INT:
      return (isArray)
        ? (v) => gl.uniform1iv(loc, v)
        : (v) => gl.uniform1i(loc, v);
    case gl.INT_VEC2:
      return (v) => gl.uniform2iv(loc, v);
    case gl.INT_VEC3:
      return (v) => gl.uniform3iv(loc, v);
    case gl.INT_VEC4:
      return (v) => gl.uniform4iv(loc, v);
    case gl.BOOL:
      return (v) => gl.uniform1iv(loc, v);
    case gl.BOOL_VEC2:
      return (v) => gl.uniform2iv(loc, v);
    case gl.BOOL_VEC3:
      return (v) => gl.uniform3iv(loc, v);
    case gl.BOOL_VEC4:
      return (v) => gl.uniform4iv(loc, v);
    case gl.FLOAT_MAT2:
      return (v) => gl.uniformMatrix2fv(loc, false, v);
    case gl.FLOAT_MAT3:
      return (v) => gl.uniformMatrix3fv(loc, false, v);
    case gl.FLOAT_MAT4:
      return (v) => gl.uniformMatrix4fv(loc, false, v);
    case gl.SAMPLER_2D:
      return getTextureSetter(gl.TEXTURE_2D);
    case gl.SAMPLER_CUBE:
      return getTextureSetter(gl.TEXTURE_CUBE_MAP);
    default:  // we should never get here
      throw("unknown type: 0x" + type.toString(16));
  }

  function getTextureSetter(bindPoint) {
    return (isArray)
      ? buildTextureArraySetter(bindPoint)
      : buildTextureSetter(bindPoint);
  }

  function buildTextureSetter(bindPoint) {
    return function(texture) {
      gl.uniform1i(loc, textureUnit);
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(bindPoint, texture);
    };
  }

  function buildTextureArraySetter(bindPoint) {
    const units = Array.from(Array(size), () => textureUnit++);
    return function(textures) {
      gl.uniform1iv(loc, units);
      textures.forEach((texture, i) => {
        gl.activeTexture(gl.TEXTURE0 + units[i]);
        gl.bindTexture(bindPoint, texture);
      });
    };
  }
}

function createUniformSetters(gl, program) {
  ({
    [gl.FLOAT]: 1,
    [gl.FLOAT_VEC2]: 2,
    [gl.FLOAT_VEC3]: 3,
    [gl.FLOAT_VEC4]: 4,
    [gl.INT]: 1,
    [gl.INT_VEC2]: 2,
    [gl.INT_VEC3]: 3,
    [gl.INT_VEC4]: 4,
    [gl.BOOL]: 1,
    [gl.BOOL_VEC2]: 2,
    [gl.BOOL_VEC3]: 3,
    [gl.BOOL_VEC4]: 4,
    [gl.FLOAT_MAT2]: 4,
    [gl.FLOAT_MAT3]: 9,
    [gl.FLOAT_MAT4]: 16,
    [gl.SAMPLER_2D]: 1,
    [gl.SAMPLER_CUBE]: 1,
  });

  // Collect info about all the uniforms used by the program
  const uniformInfo = Array
    .from({ length: gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) })
    .map((v, i) => gl.getActiveUniform(program, i))
    .filter(info => info !== undefined);

  const textureTypes = [gl.SAMPLER_2D, gl.SAMPLER_CUBE];
  var textureUnit = 0;

  return uniformInfo.reduce((d, info) => {
    let { name, type, size } = info;
    let isArray = name.endsWith("[0]");
    let key = isArray ? name.slice(0, -3) : name;

    //let setter = createUniformSetter(gl, program, info, textureUnit);
    //d[key] = wrapSetter(setter, isArray, type, size);
    d[key] = createUniformSetter(gl, program, info, textureUnit);

    if (textureTypes.includes(type)) textureUnit += size;

    return d;
  }, {});
}

function initAttributes(gl, program) {
  // Construct a dictionary of the indices of each attribute used by program
  const attrIndices = Array
    .from({ length: gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) })
    .map((v, i) => gl.getActiveAttrib(program, i))
    .reduce((d, { name }, index) => (d[name] = index, d), {});

  // Construct a dictionary of functions to set a constant value for a given
  // vertex attribute, when a per-vertex buffer is not needed
  const constantSetters = Object.entries(attrIndices).reduce((d, [name, i]) => {
    d[name] = function(v) {
      gl.disableVertexAttribArray(i);

      // For float attributes, the supplied value may be a Number
      if (v.length === undefined) return gl.vertexAttrib1f(i, v);

      if (![1, 2, 3, 4].includes(v.length)) return;
      const methodName = "vertexAttrib" + v.length + "fv";
      gl[methodName](i, v);
    };
    return d;
  }, {});

  function constructVao({ attributes, indices }) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    Object.entries(attributes).forEach(([name, a]) => {
      const index = attrIndices[name];
      if (index === undefined) return;

      gl.enableVertexAttribArray(index);
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buffer);
      gl.vertexAttribPointer(
        index,                // index of attribute in program
        a.numComponents || a.size, // Number of elements to read per vertex
        a.type || gl.FLOAT,   // Type of each element
        a.normalize || false, // Whether to normalize it
        a.stride || 0,        // Byte spacing between vertices
        a.offset || 0         // Byte # to start reading from
      );
      gl.vertexAttribDivisor(index, a.divisor || 0);
    });

    if (indices) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices.buffer);

    gl.bindVertexArray(null);
    return vao;
  }

  return { constantSetters, constructVao };
}

function initProgram(gl, vertexSrc, fragmentSrc) {
  const program = gl.createProgram();
  gl.attachShader(program, loadShader(gl, gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, loadShader(gl, gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    fail$2("Unable to link the program", gl.getProgramInfoLog(program));
  }

  const { constantSetters, constructVao } = initAttributes(gl, program);
  const uniformSetters = createUniformSetters(gl, program);

  return {
    uniformSetters: Object.assign(uniformSetters, constantSetters),
    use: () => gl.useProgram(program),
    constructVao,
  };
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    let log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    fail$2("An error occured compiling the shader", log);
  }

  return shader;
}

function fail$2(msg, log) {
  throw Error("yawgl.initProgram: " + msg + ":\n" + log);
}

function initAttributeMethods(gl) {
  return { createBuffer, initAttribute, initIndices, initQuad };

  function createBuffer(data, bindPoint = gl.ARRAY_BUFFER) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(bindPoint, buffer);
    gl.bufferData(bindPoint, data, gl.STATIC_DRAW);
    return buffer;
  }

  function initAttribute(options) {
    // Set defaults for unsupplied values
    const {
      buffer = createBuffer(options.data),
      numComponents = 3,
      type = gl.FLOAT,
      normalize = false,
      stride = 0,
      offset = 0,
      divisor = 1,
    } = options;

    // Return attribute state object
    return { buffer, numComponents, type, normalize, stride, offset, divisor };
  }

  function initIndices(options) {
    const {
      buffer = createBuffer(options.data, gl.ELEMENT_ARRAY_BUFFER),
      type = gl.UNSIGNED_INT,
      offset = 0,
    } = options;

    return { buffer, type, offset };
  }

  function initQuad({ x0 = -1.0, y0 = -1.0, x1 = 1.0, y1 = 1.0 } = {}) {
    // Create a buffer with the position of the vertices within one instance
    const data = new Float32Array([
      x0, y0,  x1, y0,  x1, y1,
      x0, y0,  x1, y1,  x0, y1,
    ]);

    return initAttribute({ data, numComponents: 2, divisor: 0 });
  }
}

function initMipMapper(gl, target) {
  const isPowerOf2 = (v) => Math.log2(v) % 1 == 0;
  const setAnisotropy = setupAnisotropy(gl, target);

  return function({ mips = true, width, height }) {
    if (mips && isPowerOf2(width) && isPowerOf2(height)) {
      setAnisotropy();
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(target);
    } else {
      // WebGL1 can't handle mipmapping for non-power-of-2 images
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  };
}

function setupAnisotropy(gl, target) {
  const ext = (
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('MOZ_EXT_texture_filter_anisotropic') || 
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
  );
  if (!ext) return () => undefined;

  const maxAnisotropy = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  const pname = ext.TEXTURE_MAX_ANISOTROPY_EXT;

  // BEWARE: this texParameterf call is slow on Intel integrated graphics.
  return () => gl.texParameterf(target, pname, maxAnisotropy);
}

function initTextureMethods(gl) {
  const target = gl.TEXTURE_2D;
  const level = 0; // Mipmap level for image uploads
  const type = gl.UNSIGNED_BYTE;
  const border = 0;
  const getMips = initMipMapper(gl, target);

  return { initTexture, updateMips, initFramebuffer };

  function initTexture(options) {
    const {
      format = gl.RGBA,
      image, // ImageData, HTMLImageElement, HTMLCanvasElement, ImageBitmap
      data = null,  // ArrayBufferView
      mips = true,
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
    } = options;

    // For Image input, get size from element. Otherwise it must be supplied
    const { 
      width = 1, 
      height = 1,
    } = (image) ? image : options;

    const texture = gl.createTexture();
    gl.bindTexture(target, texture);

    gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrapT);
    if (format !== gl.RGBA) gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    if (image) {
      gl.texImage2D(target, level, format, format, type, image);
    } else {
      gl.texImage2D(target, level, format,
        width, height, border, format, type, data);
    }

    getMips({ mips, width, height });

    return texture;
  }

  function updateMips(texture) {
    gl.bindTexture(target, texture);
    gl.generateMipmap(target);
  }

  function initFramebuffer({ width, height }) {
    const texture = initTexture({ width, height });

    const buffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      target, texture, level);

    gl.bindTexture(target, null);

    return {
      sampler: texture, // TODO: rename to texture?
      buffer,
      size: { width, height },
    };
  }
}

function initContext(gl) {
  // Input is an extended WebGL context, as created by yawgl.getExtendedContext
  const canvas = gl.canvas;
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const api = { gl,
    initProgram: (vert, frag) => initProgram(gl, vert, frag),
    resizeCanvasToDisplaySize,
    bindFramebufferAndSetViewport,
    clear,
    clipRect,
    draw,
  };

  return Object.assign(api, initAttributeMethods(gl), initTextureMethods(gl));

  function resizeCanvasToDisplaySize(multiplier) {
    if (!multiplier || multiplier < 0) multiplier = 1;

    const width = Math.floor(canvas.clientWidth * multiplier);
    const height = Math.floor(canvas.clientHeight * multiplier);

    if (canvas.width === width && canvas.height === height) return false;

    canvas.width = width;
    canvas.height = height;
    return true;
  }

  function bindFramebufferAndSetViewport(options = {}) {
    const { buffer = null, size = gl.canvas } = options;
    let { width, height } = size;
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.viewport(0, 0, width, height);
  }

  function clear(color = [0.0, 0.0, 0.0, 0.0]) {
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(...color);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function clipRect(x, y, width, height) {
    gl.enable(gl.SCISSOR_TEST);
    let roundedArgs = [x, y, width, height].map(Math.round);
    gl.scissor(...roundedArgs);
  }

  function draw({ vao, indices, count = 6, instanceCount = 1 }) {
    const mode = gl.TRIANGLES;
    gl.bindVertexArray(vao);
    if (indices) {
      let { type, offset } = indices;
      gl.drawElementsInstanced(mode, count, type, offset, instanceCount);
    } else {
      gl.drawArraysInstanced(mode, 0, count, instanceCount);
    }
    gl.bindVertexArray(null);
  }
}

var version = "0.0.1";

var sprite = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="sprite">
  <!--Default image for favicon-->
  <text y="1em" font-size="80">&#127823;</text>

  <!--Spritesheet symbols: not displayed unless "used"-->
  <symbol id="hamburger" viewBox="0 0 100 70">
    <rect width="100" height="10" />
    <rect width="100" height="10" y="30" />
    <rect width="100" height="10" y="60" />
  </symbol>

  <symbol id="close" viewBox="0 0 32 32">
    <line x1="2" y1="2" x2="30" y2="30" />
    <line x1="2" y1="30" x2="30" y2="2" />
  </symbol>

  <symbol id="gt" viewBox="0 0 32 32">
    <line x1="8" y1="2" x2="24" y2="16" />
    <line x1="24" y1="16" x2="8" y2="30" />
  </symbol>

  <symbol id="gear" viewBox="0 0 400 400">
    <!--https://observablehq.com/@jjhembd/gear-icon-generator-->
    <path d="M390.00,200.00
      L386.35,237.07L329.16,247.95L311.63,280.75L334.35,334.35
      L305.56,357.98L257.42,325.23L221.83,336.03L200.00,390.00
      L162.93,386.35L152.05,329.16L119.25,311.63L65.65,334.35
      L42.02,305.56L74.77,257.42L63.97,221.83L10.00,200.00
      L13.65,162.93L70.84,152.05L88.37,119.25L65.65,65.65
      L94.44,42.02L142.58,74.77L178.17,63.97L200.00,10.00
      L237.07,13.65L247.95,70.84L280.75,88.37L334.35,65.65
      L357.98,94.44L325.23,142.58L336.03,178.17z
      M285.54,200.00A85.54,85.54,0,1,0,285.54,200.27z" />
  </symbol>

  <symbol id="marker" viewBox="0 0 24 24">
    <!-- Follows baseline-place-24px.svg from 
         https://material.io/tools/icons/?icon=place&style=baseline -->
    <path d="M12,2
      C8.13,2 5,5.13 5,9
      c0,5.25 7,13 7,13
      s7,-7.75 7,-13
      c0,-3.87 -3.13,-7 -7,-7z
      m0,9.5
      c-1.38,0 -2.5,-1.12 -2.5,-2.5
      s1.12,-2.5 2.5,-2.5 2.5,1.12 2.5,2.5 -1.12,2.5 -2.5,2.5z" />
  </symbol>

  <symbol id="spot" viewBox="0 0 12 12">
    <circle cx="6" cy="6" r="5" />
  </symbol>
</svg>
`;

function setParams$2(userParams) {
  // Get the containing DIV element, and set its CSS class
  const container = document.getElementById(userParams.container);
  container.classList.add("globelet");

  // Add Elements for globe interface, svg sprite, status bar, canvas
  const globeDiv = addChild("div", "main", container);
  globeDiv.id = "globe"; // TEMPORARY: For backwards compatibility
  globeDiv.insertAdjacentHTML('afterbegin', sprite);
  const toolTip = addChild("div", "status", globeDiv);
  const canvas = addChild("canvas", "map", globeDiv);

  // Get a WebGL context and add yawgl functionality
  const gl = getExtendedContext(canvas);
  const context = initContext(gl);

  // Get user-supplied parameters
  const {
    style, mapboxToken,
    width: rawWidth = globeDiv.clientWidth + 512,
    height: rawHeight = globeDiv.clientHeight + 512,
    center = [0.0, 0.0],
    altitude = 20000,
  } = userParams;

  // Force width >= height, and both powers of 2
  const nextPowerOf2 = v => 2 ** Math.ceil(Math.log2(v));
  const height = nextPowerOf2(rawHeight);
  const width = Math.max(nextPowerOf2(rawWidth), height);

  return { version,
    style, mapboxToken,
    width, height,
    globeDiv, context, toolTip,
    center, altitude,
  };

  function addChild(tagName, className, parentElement) {
    const child = document.createElement(tagName);
    child.className = className;
    return parentElement.appendChild(child);
  }
}

// Maximum latitude for Web Mercator: 85.0113 degrees. Beware rounding!
const maxMercLat$1 = 2.0 * Math.atan( Math.exp(Math.PI) ) - Math.PI / 2.0;
const clipLat = (lat) => Math.min(Math.max(-maxMercLat$1, lat), maxMercLat$1);
const degrees$1 = 180.0 / Math.PI;

function getProjection(units) {
  switch (units) {
    case "xy":
      return { // Input coordinates already projected to XY
        forward: p => p,
        inverse: p => p,
        scale: () => 1.0,
      };
    case "radians":
      return { 
        forward, 
        inverse, 
        scale: scale$1,
      };
    case "degrees":
      return {
        forward: (pt) => forward(pt.map(c => c / degrees$1)),
        inverse: (pt) => inverse(pt).map(c => c * degrees$1),
        scale: (pt) => scale$1(pt.map(c => c / degrees$1)),
      };
    default:
      throw Error("getProjection: unknown units = " + units);
  }
}

function forward([lon, lat]) {
  // Convert input longitude in radians to a Web Mercator x-coordinate
  // where x = 0 at lon = -PI, x = 1 at lon = +PI
  let x = 0.5 + 0.5 * lon / Math.PI;

  // Convert input latitude in radians to a Web Mercator y-coordinate
  // where y = 0 at lat = maxMercLat, y = 1 at lat = -maxMercLat
  let y = 0.5 - 0.5 / Math.PI *
    Math.log( Math.tan(Math.PI / 4.0 + clipLat(lat) / 2.0) );

  // Clip y to the range [0, 1] (it does not wrap around)
  y = Math.min(Math.max(0.0, y), 1.0);

  return [x, y];
}

function inverse([x, y]) {
  let lon = 2.0 * (x - 0.5) * Math.PI;
  let lat = 2.0 * Math.atan(Math.exp(Math.PI * (1.0 - 2.0 * y))) - Math.PI / 2;

  return [lon, lat];
}

function scale$1([lon, lat]) {
  // Return value scales a (differential) distance along the plane tangent to
  // the sphere at [lon, lat] to a distance in map coordinates.
  // NOTE: ASSUMES a sphere of radius 1! Input distances should be
  //  pre-normalized by the appropriate radius
  return 1 / (2 * Math.PI * Math.cos( clipLat(lat) ));
}

function initCoords({ size, center, zoom, clampY, projection }) {
  const minTileSize = 256;
  const logTileSize = Math.log2(minTileSize);

  const transform = { 
    k: 1, // Size of the world map, in pixels
    x: 0, // Rightward shift of lon = 0 from left edge of viewport, in pixels
    y: 0, // Downward shift of lat = 0 from top edge of viewport, in pixels
  };
  const camPos = new Float64Array([0.5, 0.5]);
  const scale = new Float64Array([1.0, 1.0]);

  setCenterZoom(center, zoom);

  return {
    getViewport,
    getTransform,
    getZoom,
    getCamPos: () => camPos.slice(),
    getScale: () => scale.slice(),

    setTransform,
    setCenterZoom,

    localToGlobal,
  };

  function getViewport(pixRatio = 1) {
    return [size.width / pixRatio, size.height / pixRatio];
  }

  function getTransform(pixRatio = 1) {
    return Object.entries(transform)
      .reduce((d, [k, v]) => (d[k] = v / pixRatio, d), {});
  }

  function getZoom(pixRatio = 1) {
    return Math.max(0, Math.log2(transform.k / pixRatio) - 9);
  }

  function setTransform(rawTransform, pixRatio = 1) {
    // Input transforms map coordinates [x, y] into viewport coordinates
    // Units are in pixels
    const kRaw = rawTransform.k * pixRatio;
    const xRaw = rawTransform.x * pixRatio;
    const yRaw = rawTransform.y * pixRatio;

    // Round kRaw to ensure tile pixels align with screen pixels
    const z = Math.log2(kRaw) - logTileSize;
    const z0 = Math.floor(z);
    const tileScale = Math.round(2 ** (z - z0) * minTileSize);
    const kNew = clampY
      ? Math.max(2 ** z0 * tileScale, size.height)
      : 2 ** z0 * tileScale;

    // Adjust translation for the change in scale, and snap to pixel grid
    const kScale = kNew / kRaw;
    // Keep the same map pixel at the center of the viewport
    const sx = kScale * xRaw + (1 - kScale) * size.width / 2;
    const sy = kScale * yRaw + (1 - kScale) * size.height / 2;
    // Limit Y so the map doesn't cross a pole
    const yLim = clampY
      ? Math.min(Math.max(-kNew / 2 + size.height, sy), kNew / 2)
      : sy;
    const [xNew, yNew] = [sx, yLim].map(Math.round);

    // Make sure camera is still pointing at the original location: shift from 
    // the center [0.5, 0.5] by the change in the translation due to rounding
    camPos[0] = 0.5 + (xNew - sx) / size.width;
    camPos[1] = 0.5 + (yNew - sy) / size.height;

    // Store the scale of the current map relative to the entire world
    scale[0] = kNew / size.width;
    scale[1] = kNew / size.height;

    // Return a flag indicating whether the transform changed
    const { k: kOld, x: xOld, y: yOld } = transform;
    if (kNew == kOld && xNew == xOld && yNew == yOld) return false;
    Object.assign(transform, { k: kNew, x: xNew, y: yNew });
    return true;
  }

  function setCenterZoom(c, z) {
    let k = 512 * 2 ** z;

    let [xr, yr] = projection.forward(c);
    let x = (0.5 - xr) * k + size.width / 2;
    let y = (0.5 - yr) * k + size.height / 2;

    return setTransform({ k, x, y });
  }

  function localToGlobal([x, y]) {
    // Convert local map pixels to global XY
    let { x: tx, y: ty, k } = transform;
    // tx, ty is the shift of the map center (in pixels) 
    //   relative to the viewport origin (top left corner)
    return [(x - tx) / k + 0.5, (y - ty) / k + 0.5];
  }
}

function initBackground(context) {
  function initPainter(style) {
    const { paint } = style;

    return function({ zoom }) {
      let opacity = paint["background-opacity"](zoom);
      let color = paint["background-color"](zoom);
      context.clear(color.map(c => c * opacity));
    };
  }

  return { initPainter };
}

var preamble = `precision highp float;

attribute vec3 tileCoords;

uniform vec4 mapCoords;   // x, y, z, extent of tileset[0]
uniform vec3 mapShift;    // translate and scale of tileset[0]

uniform vec3 screenScale; // 2 / width, -2 / height, pixRatio

vec2 tileToMap(vec2 tilePos) {
  // Find distance of this tile from top left tile, in tile units
  float zoomFac = exp2(mapCoords.z - tileCoords.z);
  vec2 dTile = zoomFac * tileCoords.xy - mapCoords.xy;
  // tileCoords.x and mapCoords.x are both wrapped to the range [0..exp(z)]
  // If the right edge of the tile is left of the map, we need to unwrap dTile
  dTile.x += (dTile.x + zoomFac <= 0.0) ? exp2(mapCoords.z) : 0.0;

  // Convert to a translation in pixels
  vec2 tileTranslate = dTile * mapShift.z + mapShift.xy;

  // Find scaling between tile coordinates and screen pixels
  float tileScale = zoomFac * mapShift.z / mapCoords.w;

  return tilePos * tileScale + tileTranslate;
}

vec4 mapToClip(vec2 mapPos, float z) {
  vec2 projected = mapPos * screenScale.xy + vec2(-1.0, 1.0);
  return vec4(projected, z, 1);
}
`;

var vert = `attribute vec2 quadPos; // Vertices of the quad instance
attribute vec2 circlePos;
attribute float radius;
attribute vec4 color;
attribute float opacity;

varying vec2 delta;
varying vec4 strokeStyle;
varying float circleRadius;

void main() {
  vec2 mapPos = tileToMap(circlePos);

  // Shift to the appropriate corner of the current instance quad
  delta = 2.0 * quadPos * (radius + 1.0);
  vec2 dPos = delta * screenScale.z;

  strokeStyle = color * opacity;
  // TODO: normalize delta? Then can drop one varying
  circleRadius = radius;

  gl_Position = mapToClip(mapPos + dPos, 0.0);
}
`;

var frag = `precision mediump float;

varying vec2 delta;
varying vec4 strokeStyle;
varying float circleRadius;

void main() {
  float r = length(delta);
  float dr = fwidth(r);

  float taper = 1.0 - smoothstep(circleRadius - dr, circleRadius + dr, r);
  gl_FragColor = strokeStyle * taper;
}
`;

function initGrid(framebufferSize, useProgram, setters) {
  const { screenScale, mapCoords, mapShift } = setters;

  return function(tileset, pixRatio = 1) {
    useProgram();

    const { width, height } = framebufferSize;
    screenScale([ 2 / width, -2 / height, pixRatio ]);

    const { x, y, z } = tileset[0];
    const numTiles = 1 << z;
    const xw = x - Math.floor(x / numTiles) * numTiles;
    const extent = 512; // TODO: don't assume this!!
    mapCoords([xw, y, z, extent]);

    const { translate, scale } = tileset;
    const pixScale = scale * pixRatio;
    const [dx, dy] = [x, y].map((c, i) => (c + translate[i]) * pixScale);

    // At low zooms, some tiles may be repeated on opposite ends of the map
    // We split them into subsets, with different values of mapShift
    // NOTE: Only accounts for repetition across X!
    const subsets = [];
    [0, 1, 2].forEach(addSubset);

    function addSubset(repeat) {
      let shift = repeat * numTiles;
      let tiles = tileset.filter(tile => {
        let delta = tile.x - x;
        return (delta >= shift && delta < shift + numTiles);
      });
      if (!tiles.length) return;
      let setter = () => mapShift([dx + shift * pixScale, dy, pixScale]);
      subsets.push({ tiles, setter });
    }

    return { translate, scale: pixScale, subsets };
  };
}

function initTilesetPainter(setGrid, zoomFuncs, paintTile) {
  return function({ tileset, zoom, pixRatio = 1 }) {
    if (!tileset || !tileset.length) return;

    const { translate, scale, subsets } = setGrid(tileset, pixRatio);

    zoomFuncs.forEach(f => f(zoom));

    subsets.forEach(({ setter, tiles }) => {
      setter();
      tiles.forEach(box => paintTile(box, translate, scale));
    });
  };
}

function initSetters(pairs, uniformSetters) {
  return pairs
    .filter(([get]) => get.type !== "property")
    .map(([get, key]) => {
      let set = uniformSetters[key];
      return (z, f) => set(get(z, f));
    });
}

function initVectorTilePainter(context, framebufferSize, layerId, setAtlas) {
  return function(tileBox, translate, scale) {
    const { x, y, tile } = tileBox;
    const { layers, atlas } = tile.data;

    const data = layers[layerId];
    if (!data) return;

    const [x0, y0] = [x, y].map((c, i) => (c + translate[i]) * scale);
    const yflip = framebufferSize.height - y0 - scale;
    context.clipRect(x0, yflip, scale, scale);

    if (setAtlas && atlas) setAtlas(atlas);

    context.draw(data.buffers);
  };
}

function initCircle(context, framebufferSize, preamble) {
  const { initProgram, initQuad, initAttribute } = context;

  const program = initProgram(preamble + vert, frag);
  const { use, uniformSetters, constructVao } = program;

  const grid = initGrid(framebufferSize, use, uniformSetters);

  const quadPos = initQuad({ x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 });

  const attrInfo = {
    circlePos: { numComponents: 2 },
    tileCoords: { numComponents: 3 },
    radius: { numComponents: 1 },
    color: { numComponents: 4 },
    opacity: { numComponents: 1 },
  };

  function load(buffers) {
    const attributes = Object.entries(attrInfo).reduce((d, [key, info]) => {
      let data = buffers[key];
      if (data) d[key] = initAttribute(Object.assign({ data }, info));
      return d;
    }, { quadPos });

    const vao = constructVao({ attributes });
    return { vao, instanceCount: buffers.circlePos.length / 2 };
  }

  function initPainter(style) {
    const { id, paint } = style;

    const zoomFuncs = initSetters([
      [paint["circle-radius"],  "radius"],
      [paint["circle-color"],   "color"],
      [paint["circle-opacity"], "opacity"],
    ], uniformSetters);

    const paintTile = initVectorTilePainter(context, framebufferSize, id);
    return initTilesetPainter(grid, zoomFuncs, paintTile);
  }
  return { load, initPainter };
}

var vert$1 = `attribute vec2 quadPos;
attribute vec3 pointA, pointB, pointC, pointD;
attribute vec4 color;
attribute float opacity;

uniform float lineWidth, miterLimit;

varying float yCoord;
varying vec2 miterCoord1, miterCoord2;
varying vec4 strokeStyle;

mat3 miterTransform(vec2 xHat, vec2 yHat, vec2 v, float pixWidth) {
  // Find a coordinate basis vector aligned along the bisector
  bool isCap = length(v) < 0.0001; // TODO: think about units
  vec2 vHat = (isCap)
    ? xHat // Treat v = 0 like 180 deg turn
    : normalize(v);
  vec2 m0 = (dot(xHat, vHat) < -0.9999)
    ? yHat // For vHat == -xHat
    : normalize(xHat + vHat);
  
  // Find a perpendicular basis vector, pointing toward xHat
  float x_m0 = dot(xHat, m0);
  vec2 m1 = (x_m0 < 0.9999)
    ? normalize(xHat - vHat)
    : yHat;

  // Compute miter length
  float sin2 = 1.0 - x_m0 * x_m0; // Could be zero!
  float miterLength = (sin2 > 0.0001)
    ? inversesqrt(sin2)
    : miterLimit + 1.0;
  float bevelLength = abs(dot(yHat, m0));
  float tx = (miterLength > miterLimit)
    ? 0.5 * pixWidth * bevelLength
    : 0.5 * pixWidth * miterLength;

  float ty = isCap ? 1.2 * pixWidth : 0.0;

  return mat3(m0.x, m1.x, 0, m0.y, m1.y, 0, tx, ty, 1);
}

void main() {
  // Transform vertex positions from tile to map coordinates
  vec2 mapA = tileToMap(pointA.xy);
  vec2 mapB = tileToMap(pointB.xy);
  vec2 mapC = tileToMap(pointC.xy);
  vec2 mapD = tileToMap(pointD.xy);

  vec2 xAxis = mapC - mapB;
  vec2 xBasis = normalize(xAxis);
  vec2 yBasis = vec2(-xBasis.y, xBasis.x);

  // Get coordinate transforms for the miters
  float pixWidth = lineWidth * screenScale.z;
  mat3 m1 = miterTransform(xBasis, yBasis, mapA - mapB, pixWidth);
  mat3 m2 = miterTransform(-xBasis, yBasis, mapD - mapC, pixWidth);

  // Find the position of the current instance vertex, in 3 coordinate systems
  vec2 extend = miterLimit * xBasis * pixWidth * (quadPos.x - 0.5);
  // Add one pixel on either side of the line for the anti-alias taper
  float y = (pixWidth + 2.0) * quadPos.y;
  vec2 point = mapB + xAxis * quadPos.x + yBasis * y + extend;
  miterCoord1 = (m1 * vec3(point - mapB, 1)).xy;
  miterCoord2 = (m2 * vec3(point - mapC, 1)).xy;

  // Remove pixRatio from varying (we taper edges using unscaled value)
  yCoord = y / screenScale.z;

  // TODO: should this premultiplication be done in tile-stencil?
  //vec4 premult = vec4(color.rgb * color.a, color.a);
  //strokeStyle = premult * opacity;
  strokeStyle = color * opacity;

  gl_Position = mapToClip(point, pointB.z + pointC.z);
}
`;

var frag$1 = `precision highp float;

uniform float lineWidth;

varying float yCoord;
varying vec2 miterCoord1, miterCoord2;
varying vec4 strokeStyle;

void main() {
  float step0 = fwidth(yCoord) * 0.707;
  vec2 step1 = fwidth(miterCoord1) * 0.707;
  vec2 step2 = fwidth(miterCoord2) * 0.707;

  // Antialiasing for edges of lines
  float outside = -0.5 * lineWidth - step0;
  float inside = -0.5 * lineWidth + step0;
  float antialias = smoothstep(outside, inside, -abs(yCoord));

  // Bevels, endcaps: Use smooth taper for antialiasing
  float taperx = 
    smoothstep(-step1.x, step1.x, miterCoord1.x) *
    smoothstep(-step2.x, step2.x, miterCoord2.x);

  // Miters: Use hard step, slightly shifted to avoid overlap at center
  float tapery = 
    step(-0.01 * step1.y, miterCoord1.y) *
    step(0.01 * step2.y, miterCoord2.y);

  gl_FragColor = strokeStyle * antialias * taperx * tapery;
}
`;

function initLineLoader(context, constructVao) {
  const { initQuad, createBuffer, initAttribute } = context;

  const quadPos = initQuad({ x0: 0.0, y0: -0.5, x1: 1.0, y1: 0.5 });

  const attrInfo = {
    tileCoords: { numComponents: 3 },
    color: { numComponents: 4 },
    opacity: { numComponents: 1 },
  };

  const numComponents = 3;
  const stride = Float32Array.BYTES_PER_ELEMENT * numComponents;

  return function(buffers) {
    const { lines } = buffers;

    // Create buffer containing the vertex positions
    const buffer = createBuffer(lines);

    // Create interleaved attributes pointing to different offsets in buffer
    const geometryAttributes = {
      quadPos,
      pointA: setupPoint(0),
      pointB: setupPoint(1),
      pointC: setupPoint(2),
      pointD: setupPoint(3),
    };

    function setupPoint(shift) {
      const offset = shift * stride;
      return initAttribute({ buffer, numComponents, stride, offset });
    }

    const attributes = Object.entries(attrInfo).reduce((d, [key, info]) => {
      let data = buffers[key];
      if (data) d[key] = initAttribute(Object.assign({ data }, info));
      return d;
    }, geometryAttributes);

    const vao = constructVao({ attributes });

    return { vao, instanceCount: lines.length / numComponents - 3 };
  };
}

function initLine(context, framebufferSize, preamble) {
  const program = context.initProgram(preamble + vert$1, frag$1);
  const { use, uniformSetters, constructVao } = program;

  const grid = initGrid(framebufferSize, use, uniformSetters);

  const load = initLineLoader(context, constructVao);

  function initPainter(style) {
    const { id, layout, paint } = style;

    const zoomFuncs = initSetters([
      // TODO: move these to serialization step??
      //[layout["line-cap"],      "lineCap"],
      //[layout["line-join"],     "lineJoin"],
      [layout["line-miter-limit"], "miterLimit"],

      [paint["line-width"],     "lineWidth"],
      [paint["line-color"],     "color"],
      [paint["line-opacity"],   "opacity"],
      // line-gap-width,
      // line-translate, line-translate-anchor,
      // line-offset, line-blur, line-gradient, line-pattern
    ], uniformSetters);

    const paintTile = initVectorTilePainter(context, framebufferSize, id);
    return initTilesetPainter(grid, zoomFuncs, paintTile);
  }
  return { load, initPainter };
}

var vert$2 = `attribute vec2 position;
attribute vec4 color;
attribute float opacity;

uniform vec2 translation;   // From style property paint["fill-translate"]

varying vec4 fillStyle;

void main() {
  vec2 mapPos = tileToMap(position) + translation * screenScale.z;

  fillStyle = color * opacity;

  gl_Position = mapToClip(mapPos, 0.0);
}
`;

var frag$2 = `precision mediump float;

varying vec4 fillStyle;

void main() {
    gl_FragColor = fillStyle;
}
`;

function initFillLoader(context, constructVao) {
  const { initAttribute, initIndices } = context;

  const attrInfo = {
    position: { numComponents: 2, divisor: 0 },
    tileCoords: { numComponents: 3, divisor: 0 },
    color: { numComponents: 4, divisor: 0 },
    opacity: { numComponents: 1, divisor: 0 },
  };

  return function(buffers) {
    const attributes = Object.entries(attrInfo).reduce((d, [key, info]) => {
      let data = buffers[key];
      if (data) d[key] = initAttribute(Object.assign({ data }, info));
      return d;
    }, {});

    const indices = initIndices({ data: buffers.indices });
    const count = buffers.indices.length;

    const vao = constructVao({ attributes, indices });
    return { vao, indices, count };
  };
}

function initFill(context, framebufferSize, preamble) {
  const program = context.initProgram(preamble + vert$2, frag$2);
  const { use, uniformSetters, constructVao } = program;
  const grid = initGrid(framebufferSize, use, uniformSetters);

  const load = initFillLoader(context, constructVao);

  function initPainter(style) {
    const { id, paint } = style;

    const zoomFuncs = initSetters([
      [paint["fill-color"],     "color"],
      [paint["fill-opacity"],   "opacity"],
      [paint["fill-translate"], "translation"],
    ], uniformSetters);

    const paintTile = initVectorTilePainter(context, framebufferSize, id);
    return initTilesetPainter(grid, zoomFuncs, paintTile);
  }
  return { load, initPainter };
}

var vert$3 = `attribute vec2 quadPos;  // Vertices of the quad instance
attribute vec2 labelPos; // x, y
attribute vec3 charPos;  // dx, dy, scale (relative to labelPos)
attribute vec4 sdfRect;  // x, y, w, h
attribute vec4 color;
attribute float opacity;

varying vec2 texCoord;
varying vec4 fillStyle;

void main() {
  fillStyle = color * opacity;

  texCoord = sdfRect.xy + sdfRect.zw * quadPos;

  vec2 mapPos = tileToMap(labelPos);

  // Shift to the appropriate corner of the current instance quad
  vec2 dPos = (charPos.xy + sdfRect.zw * quadPos) * charPos.z * screenScale.z;

  gl_Position = mapToClip(mapPos + dPos, 0.0);
}
`;

var frag$3 = `precision highp float;

uniform sampler2D sdf;
uniform vec2 sdfDim;

varying vec4 fillStyle;
varying vec2 texCoord;

void main() {
  float sdfVal = texture2D(sdf, texCoord / sdfDim).a;
  // Find taper width: ~ dScreenPixels / dTexCoord
  float screenScale = 1.414 / length(fwidth(texCoord));
  float screenDist = screenScale * (191.0 - 255.0 * sdfVal) / 32.0;

  // TODO: threshold 0.5 looks too pixelated. Why?
  float alpha = smoothstep(-0.8, 0.8, -screenDist);
  gl_FragColor = fillStyle * alpha;
}
`;

function initTextLoader(context, constructVao) {
  const { initQuad, initAttribute } = context;

  const quadPos = initQuad({ x0: 0.0, y0: 0.0, x1: 1.0, y1: 1.0 });

  const attrInfo = {
    labelPos: { numComponents: 2 },
    charPos: { numComponents: 3 },
    sdfRect: { numComponents: 4 },
    tileCoords: { numComponents: 3 },
    color: { numComponents: 4 },
    opacity: { numComponents: 1 },
  };

  return function(buffers) {
    const attributes = Object.entries(attrInfo).reduce((d, [key, info]) => {
      let data = buffers[key];
      if (data) d[key] = initAttribute(Object.assign({ data }, info));
      return d;
    }, { quadPos });

    const vao = constructVao({ attributes });

    return { vao, instanceCount: buffers.labelPos.length / 2 };
  };
}

function initText(context, framebufferSize, preamble) {
  const program = context.initProgram(preamble + vert$3, frag$3);
  const { use, uniformSetters, constructVao } = program;
  const grid = initGrid(framebufferSize, use, uniformSetters);

  const load = initTextLoader(context, constructVao);

  function setAtlas(atlas) {
    uniformSetters.sdf(atlas.sampler);
    uniformSetters.sdfDim([atlas.width, atlas.height]);
  }

  function initPainter(style) {
    const { id, paint } = style;

    const zoomFuncs = initSetters([
      [paint["text-color"],   "color"],
      [paint["text-opacity"], "opacity"],

      // text-halo-color
      // TODO: sprites
    ], uniformSetters);

    const paintTile = initVectorTilePainter(context, framebufferSize, id, setAtlas);
    return initTilesetPainter(grid, zoomFuncs, paintTile);
  }
  return { load, initPainter };
}

function initGLpaint(context, framebuffer) {
  const programs = {
    "background": initBackground(context),
    "circle": initCircle(context, framebuffer.size, preamble),
    "line":   initLine(context, framebuffer.size, preamble),
    "fill":   initFill(context, framebuffer.size, preamble),
    "symbol": initText(context, framebuffer.size, preamble),
  };

  function prep() {
    context.bindFramebufferAndSetViewport(framebuffer);
    return context.clear();
  }

  function loadBuffers(buffers) {
    if (buffers.indices) {
      return programs.fill.load(buffers);
    } else if (buffers.lines) {
      return programs.line.load(buffers);
    } else if (buffers.circlePos) {
      return programs.circle.load(buffers);
    } else if (buffers.labelPos) {
      return programs.symbol.load(buffers);
    } else {
      throw("loadBuffers: unknown buffers structure!");
    }
  }

  function loadAtlas(atlas) {
    const format = context.gl.ALPHA;
    const mips = false;

    const { width, height, data } = atlas;
    const sampler = context.initTexture({ format, width, height, data, mips });

    return { width, height, sampler };
  }

  function initPainter(style) {
    const { id, type, source, minzoom = 0, maxzoom = 24 } = style;

    const program = programs[type];
    if (!program) return () => null;

    const painter = program.initPainter(style);
    return Object.assign(painter, { id, type, source, minzoom, maxzoom });
  }

  return { prep, loadBuffers, loadAtlas, initPainter };
}

function initEventHandler() {
  // Stores events and listeners. Listeners will be executed even if
  // the event occurred before the listener was added

  const events = {};    // { type1: data1, type2: data2, ... }
  const listeners = {}; // { type1: { id1: func1, id2: func2, ...}, type2: ... }
  var globalID = 0;

  function emitEvent(type, data = "1") {
    events[type] = data;

    let audience = listeners[type];
    if (!audience) return;

    Object.values(audience).forEach(listener => listener(data));
  }

  function addListener(type, listener) {
    if (!listeners[type]) listeners[type] = {};

    let id = ++globalID;
    listeners[type][id] = listener;
    
    if (events[type]) listener(events[type]);
    return id;
  }

  function removeListener(type, id) {
    let audience = listeners[type];
    if (audience) delete audience[id];
  }

  return {
    emitEvent,
    addListener,
    removeListener,
  };
}

function setParams$1(userParams) {
  const gl = userParams.context.gl;
  if (!(gl instanceof WebGLRenderingContext)) {
    fail("no valid WebGL context");
  }

  const {
    context,
    framebuffer = { buffer: null, size: gl.canvas },
    center = [0.0, 0.0], // ASSUMED to be in degrees!
    zoom = 4,
    style,
    mapboxToken,
    clampY = true,
    units = 'degrees',
  } = userParams;

  const { buffer, size } = framebuffer;
  if (!(buffer instanceof WebGLFramebuffer) && buffer !== null) {
    fail("no valid framebuffer");
  }

  if (!size || !allPosInts(size.width, size.height)) {
    fail("invalid size object");
  }

  if (!Array.isArray(center) || center.length < 2) {
    fail("invalid center coordinates");
  }

  if (!Number.isFinite(zoom)) {
    fail("invalid zoom value");
  }

  const validUnits = ["degrees", "radians", "xy"];
  if (!validUnits.includes(units)) fail("invalid units");
  const projection = getProjection(units);

  // Convert initial center position from degrees to the specified units
  const projCenter = getProjection("degrees").forward(center);
  if (!all0to1(...projCenter)) fail ("invalid center coordinates");
  const invCenter = projection.inverse(projCenter);

  return {
    gl, framebuffer,
    projection,
    coords: initCoords({ size, center: invCenter, zoom, clampY, projection }),
    style, mapboxToken,
    context: initGLpaint(context, framebuffer),
    eventHandler: initEventHandler(),
  };
}

function fail(message) {
  throw Error("tile-setter parameter check: " + message + "!");
}

function allPosInts(...vals) {
  return vals.every(v => Number.isInteger(v) && v > 0);
}

function all0to1(...vals) {
  return vals.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
}

function expandStyleURL(url, token) {
  var prefix = /^mapbox:\/\/styles\//;
  if ( !url.match(prefix) ) return url;
  var apiRoot = "https://api.mapbox.com/styles/v1/";
  return url.replace(prefix, apiRoot) + "?access_token=" + token;
}

function expandSpriteURLs(url, token) {
  // Returns an array containing urls to .png and .json files
  var prefix = /^mapbox:\/\/sprites\//;
  if ( !url.match(prefix) ) return {
    image: url + ".png", 
    meta: url + ".json",
  };

  // We have a Mapbox custom url. Expand to an absolute URL, as per the spec
  var apiRoot = "https://api.mapbox.com/styles/v1/";
  url = url.replace(prefix, apiRoot) + "/sprite";
  var tokenString = "?access_token=" + token;
  return {
    image: url + ".png" + tokenString, 
    meta: url + ".json" + tokenString,
  };
}

function expandTileURL(url, token) {
  var prefix = /^mapbox:\/\//;
  if ( !url.match(prefix) ) return url;
  var apiRoot = "https://api.mapbox.com/v4/";
  return url.replace(prefix, apiRoot) + ".json?secure&access_token=" + token;
}

function expandGlyphURL(url, token) {
  var prefix = /^mapbox:\/\/fonts\//;
  if ( !url.match(prefix) ) return url;
  var apiRoot = "https://api.mapbox.com/fonts/v1/";
  return url.replace(prefix, apiRoot) + "?access_token=" + token;
}

function getJSON(data) {
  switch (typeof data) {
    case "object":
      // data may be GeoJSON already. Confirm and return
      return (data !== null && data.type)
        ? Promise.resolve(data)
        : Promise.reject(data);

    case "string":
      // data must be a URL
      return fetch(data).then(response => {
        return (response.ok)
          ? response.json()
          : Promise.reject(response);
      });

    default:
      return Promise.reject(data);
  }
}

function getImage(href) {
  const errMsg = "ERROR in getImage for href " + href;
  const img = new Image();

  return new Promise( (resolve, reject) => {
    img.onerror = () => reject(errMsg);

    img.onload = () => (img.complete && img.naturalWidth !== 0)
        ? resolve(img)
        : reject(errMsg);

    img.crossOrigin = "anonymous";
    img.src = href;
  });
}

function define(constructor, factory, prototype) {
  constructor.prototype = factory.prototype = prototype;
  prototype.constructor = constructor;
}

function extend(parent, definition) {
  var prototype = Object.create(parent.prototype);
  for (var key in definition) prototype[key] = definition[key];
  return prototype;
}

function Color() {}

var darker = 0.7;
var brighter = 1 / darker;

var reI = "\\s*([+-]?\\d+)\\s*",
    reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*",
    reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
    reHex = /^#([0-9a-f]{3,8})$/,
    reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$"),
    reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$"),
    reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$"),
    reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$"),
    reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$"),
    reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");

var named = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32
};

define(Color, color, {
  copy: function(channels) {
    return Object.assign(new this.constructor, this, channels);
  },
  displayable: function() {
    return this.rgb().displayable();
  },
  hex: color_formatHex, // Deprecated! Use color.formatHex.
  formatHex: color_formatHex,
  formatHsl: color_formatHsl,
  formatRgb: color_formatRgb,
  toString: color_formatRgb
});

function color_formatHex() {
  return this.rgb().formatHex();
}

function color_formatHsl() {
  return hslConvert(this).formatHsl();
}

function color_formatRgb() {
  return this.rgb().formatRgb();
}

function color(format) {
  var m, l;
  format = (format + "").trim().toLowerCase();
  return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
      : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
      : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
      : l === 4 ? rgba((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
      : null) // invalid hex
      : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
      : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
      : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
      : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
      : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
      : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
      : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
      : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
      : null;
}

function rgbn(n) {
  return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
}

function rgba(r, g, b, a) {
  if (a <= 0) r = g = b = NaN;
  return new Rgb(r, g, b, a);
}

function rgbConvert(o) {
  if (!(o instanceof Color)) o = color(o);
  if (!o) return new Rgb;
  o = o.rgb();
  return new Rgb(o.r, o.g, o.b, o.opacity);
}

function rgb(r, g, b, opacity) {
  return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
}

function Rgb(r, g, b, opacity) {
  this.r = +r;
  this.g = +g;
  this.b = +b;
  this.opacity = +opacity;
}

define(Rgb, rgb, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  rgb: function() {
    return this;
  },
  displayable: function() {
    return (-0.5 <= this.r && this.r < 255.5)
        && (-0.5 <= this.g && this.g < 255.5)
        && (-0.5 <= this.b && this.b < 255.5)
        && (0 <= this.opacity && this.opacity <= 1);
  },
  hex: rgb_formatHex, // Deprecated! Use color.formatHex.
  formatHex: rgb_formatHex,
  formatRgb: rgb_formatRgb,
  toString: rgb_formatRgb
}));

function rgb_formatHex() {
  return "#" + hex(this.r) + hex(this.g) + hex(this.b);
}

function rgb_formatRgb() {
  var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
  return (a === 1 ? "rgb(" : "rgba(")
      + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", "
      + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", "
      + Math.max(0, Math.min(255, Math.round(this.b) || 0))
      + (a === 1 ? ")" : ", " + a + ")");
}

function hex(value) {
  value = Math.max(0, Math.min(255, Math.round(value) || 0));
  return (value < 16 ? "0" : "") + value.toString(16);
}

function hsla(h, s, l, a) {
  if (a <= 0) h = s = l = NaN;
  else if (l <= 0 || l >= 1) h = s = NaN;
  else if (s <= 0) h = NaN;
  return new Hsl(h, s, l, a);
}

function hslConvert(o) {
  if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
  if (!(o instanceof Color)) o = color(o);
  if (!o) return new Hsl;
  if (o instanceof Hsl) return o;
  o = o.rgb();
  var r = o.r / 255,
      g = o.g / 255,
      b = o.b / 255,
      min = Math.min(r, g, b),
      max = Math.max(r, g, b),
      h = NaN,
      s = max - min,
      l = (max + min) / 2;
  if (s) {
    if (r === max) h = (g - b) / s + (g < b) * 6;
    else if (g === max) h = (b - r) / s + 2;
    else h = (r - g) / s + 4;
    s /= l < 0.5 ? max + min : 2 - max - min;
    h *= 60;
  } else {
    s = l > 0 && l < 1 ? 0 : h;
  }
  return new Hsl(h, s, l, o.opacity);
}

function hsl(h, s, l, opacity) {
  return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
}

function Hsl(h, s, l, opacity) {
  this.h = +h;
  this.s = +s;
  this.l = +l;
  this.opacity = +opacity;
}

define(Hsl, hsl, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  rgb: function() {
    var h = this.h % 360 + (this.h < 0) * 360,
        s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
        l = this.l,
        m2 = l + (l < 0.5 ? l : 1 - l) * s,
        m1 = 2 * l - m2;
    return new Rgb(
      hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
      hsl2rgb(h, m1, m2),
      hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
      this.opacity
    );
  },
  displayable: function() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s))
        && (0 <= this.l && this.l <= 1)
        && (0 <= this.opacity && this.opacity <= 1);
  },
  formatHsl: function() {
    var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
    return (a === 1 ? "hsl(" : "hsla(")
        + (this.h || 0) + ", "
        + (this.s || 0) * 100 + "%, "
        + (this.l || 0) * 100 + "%"
        + (a === 1 ? ")" : ", " + a + ")");
  }
}));

/* From FvD 13.37, CSS Color Module Level 3 */
function hsl2rgb(h, m1, m2) {
  return (h < 60 ? m1 + (m2 - m1) * h / 60
      : h < 180 ? m2
      : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
      : m1) * 255;
}

function buildInterpolator(stops, base = 1) {
  if (!stops || stops.length < 2 || stops[0].length !== 2) return;

  // Confirm stops are all the same type, and convert colors to arrays
  const type = getType(stops[0][1]);
  if (!stops.every(s => getType(s[1]) === type)) return;
  stops = stops.map(([x, y]) => [x, convertIfColor(y)]);

  const izm = stops.length - 1;

  const scale = getScale(base);
  const interpolate = getInterpolator(type);

  return function(x) {
    let iz = stops.findIndex(stop => stop[0] > x);

    if (iz === 0) return stops[0][1]; // x is below first stop
    if (iz < 0) return stops[izm][1]; // x is above last stop

    let [x0, y0] = stops[iz - 1];
    let [x1, y1] = stops[iz];

    return interpolate(y0, scale(x0, x, x1), y1);
  }
}

function getType(v) {
  return color(v) ? "color" : typeof v;
}

function convertIfColor(val) {
  // Convert CSS color strings to clamped RGBA arrays for WebGL
  if (!color(val)) return val;
  let c = rgb(val);
  return [c.r / 255, c.g / 255, c.b / 255, c.opacity];
}

function getScale(base) {
  // Return a function to find the relative position of x between a and b

  // Exponential scale follows mapbox-gl-js, style-spec/function/index.js
  // NOTE: https://github.com/mapbox/mapbox-gl-js/issues/2698 not addressed!
  const scale = (base === 1)
    ? (a, x, b) => (x - a) / (b - a)  // Linear scale
    : (a, x, b) => (Math.pow(base, x - a) - 1) / (Math.pow(base, b - a) - 1);

  // Add check for zero range
  return (a, x, b) => (a === b)
    ? 0
    : scale(a, x, b);
}

function getInterpolator(type) {
  // Return a function to find an interpolated value between end values v1, v2,
  // given relative position t between the two end positions

  switch (type) {
    case "number": // Linear interpolator
      return (v1, t, v2) => v1 + t * (v2 - v1);

    case "color":  // Interpolate RGBA
      return (v1, t, v2) =>
        v1.map((v, i) => v + t * (v2[i] - v));

    default:       // Assume step function
      return (v1, t, v2) => v1;
  }
}

function autoGetters(properties = {}, defaults) {
  return Object.entries(defaults).reduce((d, [key, val]) => {
    d[key] = buildStyleFunc(properties[key], val);
    return d;
  }, {});
}

function buildStyleFunc(style, defaultVal) {
  if (style === undefined) {
    return getConstFunc(defaultVal);

  } else if (typeof style !== "object" || Array.isArray(style)) {
    return getConstFunc(style);

  } else {
    return getStyleFunc(style);

  } // NOT IMPLEMENTED: zoom-and-property functions
}

function getConstFunc(rawVal) {
  const val = convertIfColor(rawVal);
  const func = () => val;
  return Object.assign(func, { type: "constant" });
}

function getStyleFunc(style) {
  const { type, property = "zoom", base = 1, stops } = style;

  const getArg = (property === "zoom")
    ? (zoom, feature) => zoom
    : (zoom, feature) => feature.properties[property];

  const getVal = (type === "identity")
    ? convertIfColor
    : buildInterpolator(stops, base);

  if (!getVal) return console.log("style: " + JSON.stringify(style) + 
    "\nERROR in tile-stencil: unsupported style!");

  const styleFunc = (zoom, feature) => getVal(getArg(zoom, feature));

  return Object.assign(styleFunc, {
    type: (property === "zoom") ? "zoom" : "property",
    property,
  });
}

const layoutDefaults = {
  "background": {
    "visibility": "visible",
  },
  "fill": {
    "visibility": "visible",
  },
  "line": {
    "visibility": "visible",
    "line-cap": "butt",
    "line-join": "miter",
    "line-miter-limit": 2,
    "line-round-limit": 1.05,
  },
  "symbol": {
    "visibility": "visible",

    "symbol-placement": "point",
    "symbol-spacing": 250,
    "symbol-avoid-edges": false,
    "symbol-sort-key": undefined,
    "symbol-z-order": "auto",

    "icon-allow-overlap": false,
    "icon-ignore-placement": false,
    "icon-optional": false,
    "icon-rotation-alignment": "auto",
    "icon-size": 1,
    "icon-text-fit": "none",
    "icon-text-fit-padding": [0, 0, 0, 0],
    "icon-image": undefined,
    "icon-rotate": 0,
    "icon-padding": 2,
    "icon-keep-upright": false,
    "icon-offset": [0, 0],
    "icon-anchor": "center",
    "icon-pitch-alignment": "auto",

    "text-pitch-alignment": "auto",
    "text-rotation-alignment": "auto",
    "text-field": "",
    "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
    "text-size": 16,
    "text-max-width": 10,
    "text-line-height": 1.2,
    "text-letter-spacing": 0,
    "text-justify": "center",
    "text-radial-offset": 0,
    "text-variable-anchor": undefined,
    "text-anchor": "center",
    "text-max-angle": 45,
    "text-rotate": 0,
    "text-padding": 2.0,
    "text-keep-upright": true,
    "text-transform": "none",
    "text-offset": [0, 0],
    "text-allow-overlap": false,
    "text-ignore-placement": false,
    "text-optional": false,
  },
  "raster": {
    "visibility": "visible",
  },
  "circle": {
    "visibility": "visible",
  },
  "fill-extrusion": {
    "visibility": "visible",
  },
  "heatmap": {
    "visibility": "visible",
  },
  "hillshade": {
    "visibility": "visible",
  },
};

const paintDefaults = {
  "background": {
    "background-color": "#000000",
    "background-opacity": 1,
    "background-pattern": undefined,
  },
  "fill": {
    "fill-antialias": true,
    "fill-opacity": 1,
    "fill-color": "#000000",
    "fill-outline-color": undefined,
    "fill-outline-width": 1, // non-standard!
    "fill-translate": [0, 0],
    "fill-translate-anchor": "map",
    "fill-pattern": undefined,
  },
  "line": {
    "line-opacity": 1,
    "line-color": "#000000",
    "line-translate": [0, 0],
    "line-translate-anchor": "map",
    "line-width": 1,
    "line-gap-width": 0,
    "line-offset": 0,
    "line-blur": 0,
    "line-dasharray": undefined,
    "line-pattern": undefined,
    "line-gradient": undefined,
  },
  "symbol": {
    "icon-opacity": 1,
    "icon-color": "#000000",
    "icon-halo-color": "rgba(0, 0, 0, 0)",
    "icon-halo-width": 0,
    "icon-halo-blur": 0,
    "icon-translate": [0, 0],
    "icon-translate-anchor": "map",

    "text-opacity": 1,
    "text-color": "#000000",
    "text-halo-color": "rgba(0, 0, 0, 0)",
    "text-halo-width": 0,
    "text-halo-blur": 0,
    "text-translate": [0, 0],
    "text-translate-anchor": "map",
  },
  "raster": {
    "raster-opacity": 1,
    "raster-hue-rotate": 0,
    "raster-brighness-min": 0,
    "raster-brightness-max": 1,
    "raster-saturation": 0,
    "raster-contrast": 0,
    "raster-resampling": "linear",
    "raster-fade-duration": 300,
  },
  "circle": {
    "circle-radius": 5,
    "circle-color": "#000000",
    "circle-blur": 0,
    "circle-opacity": 1,
    "circle-translate": [0, 0],
    "circle-translate-anchor": "map",
    "circle-pitch-scale": "map",
    "circle-pitch-alignment": "viewport",
    "circle-stroke-width": 0,
    "circle-stroke-color": "#000000",
    "circle-stroke-opacity": 1,
  },
  "fill-extrusion": {
    "fill-extrusion-opacity": 1,
    "fill-extrusion-color": "#000000",
    "fill-extrusion-translate": [0, 0],
    "fill-extrusion-translate-anchor": "map",
    "fill-extrusion-height": 0,
    "fill-extrusion-base": 0,
    "fill-extrusion-vertical-gradient": true,
  },
  "heatmap": {
    "heatmap-radius": 30,
    "heatmap-weight": 1,
    "heatmap-intensity": 1,
    "heatmap-color": ["interpolate",["linear"],["heatmap-density"],0,"rgba(0, 0, 255,0)",0.1,"royalblue",0.3,"cyan",0.5,"lime",0.7,"yellow",1,"red"],
    "heatmap-opacity": 1,
  },
  "hillshade": {
    "hillshade-illumination-direction": 335,
    "hillshade-illumination-anchor": "viewport",
    "hillshade-exaggeration": 0.5,
    "hillshade-shadow-color": "#000000",
    "hillshade-highlight-color": "#FFFFFF",
    "hillshade-accent-color": "#000000",
  },
};

const refProperties = [
  'type', 
  'source', 
  'source-layer', 
  'minzoom', 
  'maxzoom', 
  'filter', 
  'layout'
];

function derefLayers(layers) {
  // From mapbox-gl-js, style-spec/deref.js
  /**
   * Given an array of layers, some of which may contain `ref` properties
   * whose value is the `id` of another property, return a new array where
   * such layers have been augmented with the 'type', 'source', etc. properties
   * from the parent layer, and the `ref` property has been removed.
   *
   * The input is not modified. The output may contain references to portions
   * of the input.
   */
  layers = layers.slice(); // ??? What are we trying to achieve here?

  const map = Object.create(null); // stackoverflow.com/a/21079232/10082269
  layers.forEach( layer => { map[layer.id] = layer; } );

  for (let i = 0; i < layers.length; i++) {
    if ('ref' in layers[i]) {
      layers[i] = deref(layers[i], map[layers[i].ref]);
    }
  }

  return layers;
}

function deref(layer, parent) {
  const result = {};

  for (const k in layer) {
    if (k !== 'ref') {
      result[k] = layer[k];
    }
  }

  refProperties.forEach((k) => {
    if (k in parent) {
      result[k] = parent[k];
    }
  });

  return result;
}

function loadLinks(styleDoc, mapboxToken) {
  styleDoc.layers = derefLayers(styleDoc.layers);
  if (styleDoc.glyphs) {
    styleDoc.glyphs = expandGlyphURL(styleDoc.glyphs, mapboxToken);
  }

  return Promise.all([
    expandSources(styleDoc.sources, mapboxToken),
    loadSprite(styleDoc.sprite, mapboxToken),
  ]).then( ([sources, spriteData]) => {
    styleDoc.sources = sources;
    styleDoc.spriteData = spriteData;
    return styleDoc;
  });
}

function expandSources(rawSources, token) {
  const expandPromises = Object.entries(rawSources).map(expandSource);

  function expandSource([key, source]) {
    if (source.type === "geojson") {
      return getJSON(source.data).then(JSON => {
        source.data = JSON;
        return [key, source];
      });
    }

    // If no .url, return a shallow copy of the input. 
    // Note: some properties may still be pointing back to the original 
    // style document, like .vector_layers, .bounds, .center, .extent
    if (source.url === undefined) return [key, Object.assign({}, source)];

    // Load the referenced TileJSON document, add any values from source
    return getJSON( expandTileURL(source.url, token) )
      .then( tileJson => [key, Object.assign(tileJson, source)] );
  }

  function combineSources(keySourcePairs) {
    const sources = {};
    keySourcePairs.forEach( ([key, val]) => { sources[key] = val; } );
    return sources;
  }

  return Promise.all( expandPromises ).then( combineSources );
}

function loadSprite(sprite, token) {
  if (!sprite) return;

  const urls = expandSpriteURLs(sprite, token);

  return Promise.all([getImage(urls.image), getJSON(urls.meta)])
    .then( ([image, meta]) => ({ image, meta }) );
}

function getStyleFuncs(inputLayer) {
  const layer = Object.assign({}, inputLayer); // Leave input unchanged

  // Replace rendering properties with functions
  layer.layout = autoGetters(layer.layout, layoutDefaults[layer.type]);
  layer.paint  = autoGetters(layer.paint,  paintDefaults[layer.type] );

  return layer;
}

function loadStyle(style, mapboxToken) {
  // Loads a style document and any linked information

  const getStyle = (typeof style === "object")
    ? Promise.resolve(style)                // style is JSON already
    : getJSON( expandStyleURL(style, mapboxToken) ); // Get from URL

  return getStyle
    .then( styleDoc => loadLinks(styleDoc, mapboxToken) );
}

initZeroTimeouts();

function initZeroTimeouts() {
  // setTimeout with true zero delay. https://github.com/GlobeletJS/zero-timeout
  const timeouts = [];
  var taskId = 0;

  // Make a unique message, that won't be confused with messages from
  // other scripts or browser tabs
  const messageKey = "zeroTimeout_$" + Math.random().toString(36).slice(2);

  // Make it clear where the messages should be coming from
  const loc = window.location;
  var targetOrigin = loc.protocol + "//" + loc.hostname;
  if (loc.port !== "") targetOrigin += ":" + loc.port;

  // When a message is received, execute a timeout from the list
  window.addEventListener("message", evnt => {
    if (evnt.source != window || evnt.data !== messageKey) return;
    evnt.stopPropagation();

    let task = timeouts.shift();
    if (!task || task.canceled) return;
    task.func(...task.args);
  }, true);

  // Now define the external functions to set or cancel a timeout
  window.setZeroTimeout = function(func, ...args) {
    taskId += 1;
    timeouts.push({ id: taskId, func, args });
    window.postMessage(messageKey, targetOrigin);
    return taskId;
  };

  window.clearZeroTimeout = function(id) {
    let task = timeouts.find(timeout => timeout.id === id);
    if (task) task.canceled = true;
  };
}

function init$2() {
  const tasks = [];
  var taskId = 0;
  var queueIsRunning = false;

  return {
    enqueueTask,
    cancelTask,
    sortTasks,
    countTasks: () => tasks.length,
  };

  function enqueueTask(newTask) {
    const defaultPriority = () => 0;
    taskId += 1;
    tasks.push({ 
      id: taskId,
      getPriority: newTask.getPriority || defaultPriority,
      chunks: newTask.chunks,
    });
    if (!queueIsRunning) setZeroTimeout(runTaskQueue);
    return taskId;
  }

  function cancelTask(id) {
    let task = tasks.find(task => task.id === id);
    if (task) task.canceled = true;
  }

  function sortTasks() {
    tasks.sort( (a, b) => compareNums(a.getPriority(), b.getPriority()) );
  }

  function compareNums(a, b) {
    if (a === b) return 0;
    return (a === undefined || a < b) ? -1 : 1;
  }

  function runTaskQueue() {
    // Remove canceled and completed tasks
    while (isDone(tasks[0])) tasks.shift();

    queueIsRunning = (tasks.length > 0);
    if (!queueIsRunning) return;

    // Get the next chunk from the current task, and run it
    let chunk = tasks[0].chunks.shift();
    chunk();

    setZeroTimeout(runTaskQueue);
  }

  function isDone(task) {
    return task && (task.canceled || task.chunks.length < 1);
  }
}

initZeroTimeouts$1();

function initZeroTimeouts$1() {
  // setTimeout with true zero delay. https://github.com/GlobeletJS/zero-timeout
  const timeouts = [];
  var taskId = 0;

  // Make a unique message, that won't be confused with messages from
  // other scripts or browser tabs
  const messageKey = "zeroTimeout_$" + Math.random().toString(36).slice(2);

  // Make it clear where the messages should be coming from
  const loc = window.location;
  var targetOrigin = loc.protocol + "//" + loc.hostname;
  if (loc.port !== "") targetOrigin += ":" + loc.port;

  // When a message is received, execute a timeout from the list
  window.addEventListener("message", evnt => {
    if (evnt.source != window || evnt.data !== messageKey) return;
    evnt.stopPropagation();

    let task = timeouts.shift();
    if (!task || task.canceled) return;
    task.func(...task.args);
  }, true);

  // Now define the external functions to set or cancel a timeout
  window.setZeroTimeout = function(func, ...args) {
    taskId += 1;
    timeouts.push({ id: taskId, func, args });
    window.postMessage(messageKey, targetOrigin);
    return taskId;
  };

  window.clearZeroTimeout = function(id) {
    let task = timeouts.find(timeout => timeout.id === id);
    if (task) task.canceled = true;
  };
}

function init$1$1() {
  const tasks = [];
  var taskId = 0;
  var queueIsRunning = false;

  return {
    enqueueTask,
    cancelTask,
    sortTasks,
    countTasks: () => tasks.length,
  };

  function enqueueTask(newTask) {
    const defaultPriority = () => 0;
    taskId += 1;
    tasks.push({ 
      id: taskId,
      getPriority: newTask.getPriority || defaultPriority,
      chunks: newTask.chunks,
    });
    if (!queueIsRunning) setZeroTimeout(runTaskQueue);
    return taskId;
  }

  function cancelTask(id) {
    let task = tasks.find(task => task.id === id);
    if (task) task.canceled = true;
  }

  function sortTasks() {
    tasks.sort( (a, b) => compareNums(a.getPriority(), b.getPriority()) );
  }

  function compareNums(a, b) {
    if (a === b) return 0;
    return (a === undefined || a < b) ? -1 : 1;
  }

  function runTaskQueue() {
    // Remove canceled and completed tasks
    while (isDone(tasks[0])) tasks.shift();

    queueIsRunning = (tasks.length > 0);
    if (!queueIsRunning) return;

    // Get the next chunk from the current task, and run it
    let chunk = tasks[0].chunks.shift();
    chunk();

    setZeroTimeout(runTaskQueue);
  }

  function isDone(task) {
    return task && (task.canceled || task.chunks.length < 1);
  }
}

const vectorTypes = ["symbol", "circle", "line", "fill"];

function setParams$1$1(userParams) {
  const {
    threads = 2,
    context,
    source,
    glyphs,
    layers,
    queue = init$1$1(),
    verbose = false,
  } = userParams;

  // Confirm supplied styles are all vector layers reading from the same source
  if (!layers || !layers.length) fail$1("no valid array of style layers!");

  let allVectors = layers.every( l => vectorTypes.includes(l.type) );
  if (!allVectors) fail$1("not all layers are vector types!");

  let sameSource = layers.every( l => l.source === layers[0].source );
  if (!sameSource) fail$1("supplied layers use different sources!");

  if (!source) fail$1("parameters.source is required!");

  if (source.type === "vector" && !(source.tiles && source.tiles.length)) {
    fail$1("no valid vector tile endpoints!");
  }

  return {
    threads,
    context,
    source,
    glyphs,
    layers,
    queue,
    verbose,
  };
}

function fail$1(message) {
  throw Error("ERROR in tile-mixer: " + message);
}

function initWorkers(codeHref, params) {
  const { threads, glyphs, layers, source } = params;

  const tasks = {};
  var msgId = 0;

  // Initialize the worker threads, and send them the styles
  function trainWorker() {
    const worker = new Worker(codeHref);
    const payload = { styles: layers, glyphEndpoint: glyphs, source };
    worker.postMessage({ id: 0, type: "setup", payload });
    worker.onmessage = handleMsg;
    return worker;
  }
  const workers = Array.from(Array(threads), trainWorker);
  const workLoads = Array.from(Array(threads), () => 0);

  return {
    startTask,
    cancelTask,
    activeTasks: () => workLoads.reduce( (a, b) => a + b, 0 ),
    terminate: () => workers.forEach( worker => worker.terminate() ),
  }

  function startTask(payload, callback) {
    let workerID = getIdleWorkerID(workLoads);
    workLoads[workerID] += 1;

    msgId += 1;
    tasks[msgId] = { callback, workerID };
    workers[workerID].postMessage({ id: msgId, type: "getTile", payload });

    return msgId; // Returned ID can be used for later cancellation
  }

  function cancelTask(id) {
    let task = tasks[id];
    if (!task) return;
    workers[task.workerID].postMessage({ id, type: "cancel" });
    workLoads[task.workerID] -= 1;
    delete tasks[id];
  }

  function handleMsg(msgEvent) {
    const msg = msgEvent.data; // { id, type, payload }
    const task = tasks[msg.id];
    // NOTE: 'this' is the worker that emitted msgEvent
    if (!task) return this.postMessage({ id: msg.id, type: "cancel" });

    switch (msg.type) {
      case "error":
        task.callback(msg.payload);
        break;

      case "data":
        task.callback(null, msg.payload);
        break;

      default:
        task.callback("ERROR: worker sent bad message type!");
        break;
    }

    workLoads[task.workerID] -= 1;
    delete tasks[msg.id];
  }
}

function getIdleWorkerID(workLoads) {
  let id = 0;
  for (let i = 1; i < workLoads.length; i++) {
    if (workLoads[i] < workLoads[id]) id = i;
  }
  return id;
}

var workerCode = String.raw`function define(constructor, factory, prototype) {
  constructor.prototype = factory.prototype = prototype;
  prototype.constructor = constructor;
}

function extend(parent, definition) {
  var prototype = Object.create(parent.prototype);
  for (var key in definition) prototype[key] = definition[key];
  return prototype;
}

function Color() {}

var darker = 0.7;
var brighter = 1 / darker;

var reI = "\\s*([+-]?\\d+)\\s*",
    reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*",
    reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
    reHex = /^#([0-9a-f]{3,8})$/,
    reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$"),
    reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$"),
    reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$"),
    reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$"),
    reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$"),
    reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");

var named = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32
};

define(Color, color, {
  copy: function(channels) {
    return Object.assign(new this.constructor, this, channels);
  },
  displayable: function() {
    return this.rgb().displayable();
  },
  hex: color_formatHex, // Deprecated! Use color.formatHex.
  formatHex: color_formatHex,
  formatHsl: color_formatHsl,
  formatRgb: color_formatRgb,
  toString: color_formatRgb
});

function color_formatHex() {
  return this.rgb().formatHex();
}

function color_formatHsl() {
  return hslConvert(this).formatHsl();
}

function color_formatRgb() {
  return this.rgb().formatRgb();
}

function color(format) {
  var m, l;
  format = (format + "").trim().toLowerCase();
  return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
      : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
      : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
      : l === 4 ? rgba((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
      : null) // invalid hex
      : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
      : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
      : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
      : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
      : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
      : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
      : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
      : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
      : null;
}

function rgbn(n) {
  return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
}

function rgba(r, g, b, a) {
  if (a <= 0) r = g = b = NaN;
  return new Rgb(r, g, b, a);
}

function rgbConvert(o) {
  if (!(o instanceof Color)) o = color(o);
  if (!o) return new Rgb;
  o = o.rgb();
  return new Rgb(o.r, o.g, o.b, o.opacity);
}

function rgb(r, g, b, opacity) {
  return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
}

function Rgb(r, g, b, opacity) {
  this.r = +r;
  this.g = +g;
  this.b = +b;
  this.opacity = +opacity;
}

define(Rgb, rgb, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  rgb: function() {
    return this;
  },
  displayable: function() {
    return (-0.5 <= this.r && this.r < 255.5)
        && (-0.5 <= this.g && this.g < 255.5)
        && (-0.5 <= this.b && this.b < 255.5)
        && (0 <= this.opacity && this.opacity <= 1);
  },
  hex: rgb_formatHex, // Deprecated! Use color.formatHex.
  formatHex: rgb_formatHex,
  formatRgb: rgb_formatRgb,
  toString: rgb_formatRgb
}));

function rgb_formatHex() {
  return "#" + hex(this.r) + hex(this.g) + hex(this.b);
}

function rgb_formatRgb() {
  var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
  return (a === 1 ? "rgb(" : "rgba(")
      + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", "
      + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", "
      + Math.max(0, Math.min(255, Math.round(this.b) || 0))
      + (a === 1 ? ")" : ", " + a + ")");
}

function hex(value) {
  value = Math.max(0, Math.min(255, Math.round(value) || 0));
  return (value < 16 ? "0" : "") + value.toString(16);
}

function hsla(h, s, l, a) {
  if (a <= 0) h = s = l = NaN;
  else if (l <= 0 || l >= 1) h = s = NaN;
  else if (s <= 0) h = NaN;
  return new Hsl(h, s, l, a);
}

function hslConvert(o) {
  if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
  if (!(o instanceof Color)) o = color(o);
  if (!o) return new Hsl;
  if (o instanceof Hsl) return o;
  o = o.rgb();
  var r = o.r / 255,
      g = o.g / 255,
      b = o.b / 255,
      min = Math.min(r, g, b),
      max = Math.max(r, g, b),
      h = NaN,
      s = max - min,
      l = (max + min) / 2;
  if (s) {
    if (r === max) h = (g - b) / s + (g < b) * 6;
    else if (g === max) h = (b - r) / s + 2;
    else h = (r - g) / s + 4;
    s /= l < 0.5 ? max + min : 2 - max - min;
    h *= 60;
  } else {
    s = l > 0 && l < 1 ? 0 : h;
  }
  return new Hsl(h, s, l, o.opacity);
}

function hsl(h, s, l, opacity) {
  return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
}

function Hsl(h, s, l, opacity) {
  this.h = +h;
  this.s = +s;
  this.l = +l;
  this.opacity = +opacity;
}

define(Hsl, hsl, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  rgb: function() {
    var h = this.h % 360 + (this.h < 0) * 360,
        s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
        l = this.l,
        m2 = l + (l < 0.5 ? l : 1 - l) * s,
        m1 = 2 * l - m2;
    return new Rgb(
      hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
      hsl2rgb(h, m1, m2),
      hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
      this.opacity
    );
  },
  displayable: function() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s))
        && (0 <= this.l && this.l <= 1)
        && (0 <= this.opacity && this.opacity <= 1);
  },
  formatHsl: function() {
    var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
    return (a === 1 ? "hsl(" : "hsla(")
        + (this.h || 0) + ", "
        + (this.s || 0) * 100 + "%, "
        + (this.l || 0) * 100 + "%"
        + (a === 1 ? ")" : ", " + a + ")");
  }
}));

/* From FvD 13.37, CSS Color Module Level 3 */
function hsl2rgb(h, m1, m2) {
  return (h < 60 ? m1 + (m2 - m1) * h / 60
      : h < 180 ? m2
      : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
      : m1) * 255;
}

function buildInterpolator(stops, base = 1) {
  if (!stops || stops.length < 2 || stops[0].length !== 2) return;

  // Confirm stops are all the same type, and convert colors to arrays
  const type = getType(stops[0][1]);
  if (!stops.every(s => getType(s[1]) === type)) return;
  stops = stops.map(([x, y]) => [x, convertIfColor(y)]);

  const izm = stops.length - 1;

  const scale = getScale(base);
  const interpolate = getInterpolator(type);

  return function(x) {
    let iz = stops.findIndex(stop => stop[0] > x);

    if (iz === 0) return stops[0][1]; // x is below first stop
    if (iz < 0) return stops[izm][1]; // x is above last stop

    let [x0, y0] = stops[iz - 1];
    let [x1, y1] = stops[iz];

    return interpolate(y0, scale(x0, x, x1), y1);
  }
}

function getType(v) {
  return color(v) ? "color" : typeof v;
}

function convertIfColor(val) {
  // Convert CSS color strings to clamped RGBA arrays for WebGL
  if (!color(val)) return val;
  let c = rgb(val);
  return [c.r / 255, c.g / 255, c.b / 255, c.opacity];
}

function getScale(base) {
  // Return a function to find the relative position of x between a and b

  // Exponential scale follows mapbox-gl-js, style-spec/function/index.js
  // NOTE: https://github.com/mapbox/mapbox-gl-js/issues/2698 not addressed!
  const scale = (base === 1)
    ? (a, x, b) => (x - a) / (b - a)  // Linear scale
    : (a, x, b) => (Math.pow(base, x - a) - 1) / (Math.pow(base, b - a) - 1);

  // Add check for zero range
  return (a, x, b) => (a === b)
    ? 0
    : scale(a, x, b);
}

function getInterpolator(type) {
  // Return a function to find an interpolated value between end values v1, v2,
  // given relative position t between the two end positions

  switch (type) {
    case "number": // Linear interpolator
      return (v1, t, v2) => v1 + t * (v2 - v1);

    case "color":  // Interpolate RGBA
      return (v1, t, v2) =>
        v1.map((v, i) => v + t * (v2[i] - v));

    default:       // Assume step function
      return (v1, t, v2) => v1;
  }
}

function autoGetters(properties = {}, defaults) {
  return Object.entries(defaults).reduce((d, [key, val]) => {
    d[key] = buildStyleFunc(properties[key], val);
    return d;
  }, {});
}

function buildStyleFunc(style, defaultVal) {
  if (style === undefined) {
    return getConstFunc(defaultVal);

  } else if (typeof style !== "object" || Array.isArray(style)) {
    return getConstFunc(style);

  } else {
    return getStyleFunc(style);

  } // NOT IMPLEMENTED: zoom-and-property functions
}

function getConstFunc(rawVal) {
  const val = convertIfColor(rawVal);
  const func = () => val;
  return Object.assign(func, { type: "constant" });
}

function getStyleFunc(style) {
  const { type, property = "zoom", base = 1, stops } = style;

  const getArg = (property === "zoom")
    ? (zoom, feature) => zoom
    : (zoom, feature) => feature.properties[property];

  const getVal = (type === "identity")
    ? convertIfColor
    : buildInterpolator(stops, base);

  if (!getVal) return console.log("style: " + JSON.stringify(style) + 
    "\nERROR in tile-stencil: unsupported style!");

  const styleFunc = (zoom, feature) => getVal(getArg(zoom, feature));

  return Object.assign(styleFunc, {
    type: (property === "zoom") ? "zoom" : "property",
    property,
  });
}

const layoutDefaults = {
  "background": {
    "visibility": "visible",
  },
  "fill": {
    "visibility": "visible",
  },
  "line": {
    "visibility": "visible",
    "line-cap": "butt",
    "line-join": "miter",
    "line-miter-limit": 2,
    "line-round-limit": 1.05,
  },
  "symbol": {
    "visibility": "visible",

    "symbol-placement": "point",
    "symbol-spacing": 250,
    "symbol-avoid-edges": false,
    "symbol-sort-key": undefined,
    "symbol-z-order": "auto",

    "icon-allow-overlap": false,
    "icon-ignore-placement": false,
    "icon-optional": false,
    "icon-rotation-alignment": "auto",
    "icon-size": 1,
    "icon-text-fit": "none",
    "icon-text-fit-padding": [0, 0, 0, 0],
    "icon-image": undefined,
    "icon-rotate": 0,
    "icon-padding": 2,
    "icon-keep-upright": false,
    "icon-offset": [0, 0],
    "icon-anchor": "center",
    "icon-pitch-alignment": "auto",

    "text-pitch-alignment": "auto",
    "text-rotation-alignment": "auto",
    "text-field": "",
    "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
    "text-size": 16,
    "text-max-width": 10,
    "text-line-height": 1.2,
    "text-letter-spacing": 0,
    "text-justify": "center",
    "text-radial-offset": 0,
    "text-variable-anchor": undefined,
    "text-anchor": "center",
    "text-max-angle": 45,
    "text-rotate": 0,
    "text-padding": 2.0,
    "text-keep-upright": true,
    "text-transform": "none",
    "text-offset": [0, 0],
    "text-allow-overlap": false,
    "text-ignore-placement": false,
    "text-optional": false,
  },
  "raster": {
    "visibility": "visible",
  },
  "circle": {
    "visibility": "visible",
  },
  "fill-extrusion": {
    "visibility": "visible",
  },
  "heatmap": {
    "visibility": "visible",
  },
  "hillshade": {
    "visibility": "visible",
  },
};

const paintDefaults = {
  "background": {
    "background-color": "#000000",
    "background-opacity": 1,
    "background-pattern": undefined,
  },
  "fill": {
    "fill-antialias": true,
    "fill-opacity": 1,
    "fill-color": "#000000",
    "fill-outline-color": undefined,
    "fill-outline-width": 1, // non-standard!
    "fill-translate": [0, 0],
    "fill-translate-anchor": "map",
    "fill-pattern": undefined,
  },
  "line": {
    "line-opacity": 1,
    "line-color": "#000000",
    "line-translate": [0, 0],
    "line-translate-anchor": "map",
    "line-width": 1,
    "line-gap-width": 0,
    "line-offset": 0,
    "line-blur": 0,
    "line-dasharray": undefined,
    "line-pattern": undefined,
    "line-gradient": undefined,
  },
  "symbol": {
    "icon-opacity": 1,
    "icon-color": "#000000",
    "icon-halo-color": "rgba(0, 0, 0, 0)",
    "icon-halo-width": 0,
    "icon-halo-blur": 0,
    "icon-translate": [0, 0],
    "icon-translate-anchor": "map",

    "text-opacity": 1,
    "text-color": "#000000",
    "text-halo-color": "rgba(0, 0, 0, 0)",
    "text-halo-width": 0,
    "text-halo-blur": 0,
    "text-translate": [0, 0],
    "text-translate-anchor": "map",
  },
  "raster": {
    "raster-opacity": 1,
    "raster-hue-rotate": 0,
    "raster-brighness-min": 0,
    "raster-brightness-max": 1,
    "raster-saturation": 0,
    "raster-contrast": 0,
    "raster-resampling": "linear",
    "raster-fade-duration": 300,
  },
  "circle": {
    "circle-radius": 5,
    "circle-color": "#000000",
    "circle-blur": 0,
    "circle-opacity": 1,
    "circle-translate": [0, 0],
    "circle-translate-anchor": "map",
    "circle-pitch-scale": "map",
    "circle-pitch-alignment": "viewport",
    "circle-stroke-width": 0,
    "circle-stroke-color": "#000000",
    "circle-stroke-opacity": 1,
  },
  "fill-extrusion": {
    "fill-extrusion-opacity": 1,
    "fill-extrusion-color": "#000000",
    "fill-extrusion-translate": [0, 0],
    "fill-extrusion-translate-anchor": "map",
    "fill-extrusion-height": 0,
    "fill-extrusion-base": 0,
    "fill-extrusion-vertical-gradient": true,
  },
  "heatmap": {
    "heatmap-radius": 30,
    "heatmap-weight": 1,
    "heatmap-intensity": 1,
    "heatmap-color": ["interpolate",["linear"],["heatmap-density"],0,"rgba(0, 0, 255,0)",0.1,"royalblue",0.3,"cyan",0.5,"lime",0.7,"yellow",1,"red"],
    "heatmap-opacity": 1,
  },
  "hillshade": {
    "hillshade-illumination-direction": 335,
    "hillshade-illumination-anchor": "viewport",
    "hillshade-exaggeration": 0.5,
    "hillshade-shadow-color": "#000000",
    "hillshade-highlight-color": "#FFFFFF",
    "hillshade-accent-color": "#000000",
  },
};

function getStyleFuncs(inputLayer) {
  const layer = Object.assign({}, inputLayer); // Leave input unchanged

  // Replace rendering properties with functions
  layer.layout = autoGetters(layer.layout, layoutDefaults[layer.type]);
  layer.paint  = autoGetters(layer.paint,  paintDefaults[layer.type] );

  return layer;
}

function buildFeatureFilter(filterObj) {
  // filterObj is a filter definition following the "deprecated" syntax:
  // https://docs.mapbox.com/mapbox-gl-js/style-spec/#other-filter
  if (!filterObj) return () => true;
  const [type, ...vals] = filterObj;

  // If this is a combined filter, the vals are themselves filter definitions
  switch (type) {
    case "all": {
      let filters = vals.map(buildFeatureFilter);  // Iteratively recursive!
      return (d) => filters.every( filt => filt(d) );
    }
    case "any": {
      let filters = vals.map(buildFeatureFilter);
      return (d) => filters.some( filt => filt(d) );
    }
    case "none": {
      let filters = vals.map(buildFeatureFilter);
      return (d) => filters.every( filt => !filt(d) );
    }
    default:
      return getSimpleFilter(filterObj);
  }
}

function getSimpleFilter(filterObj) {
  const [type, key, ...vals] = filterObj;
  const getVal = initFeatureValGetter(key);

  switch (type) {
    // Existential Filters
    case "has": 
      return d => !!getVal(d); // !! forces a Boolean return
    case "!has": 
      return d => !getVal(d);

    // Comparison Filters
    case "==": 
      return d => getVal(d) === vals[0];
    case "!=":
      return d => getVal(d) !== vals[0];
    case ">":
      return d => getVal(d) > vals[0];
    case ">=":
      return d => getVal(d) >= vals[0];
    case "<":
      return d => getVal(d) < vals[0];
    case "<=":
      return d => getVal(d) <= vals[0];

    // Set Membership Filters
    case "in" :
      return d => vals.includes( getVal(d) );
    case "!in" :
      return d => !vals.includes( getVal(d) );
    default:
      console.log("prepFilter: unknown filter type = " + filterObj[0]);
  }
  // No recognizable filter criteria. Return a filter that is always true
  return () => true;
}

function initFeatureValGetter(key) {
  switch (key) {
    case "$type":
      // NOTE: data includes MultiLineString, MultiPolygon, etc-NOT IN SPEC
      return f => {
        let t = f.geometry.type;
        if (t === "MultiPoint") return "Point";
        if (t === "MultiLineString") return "LineString";
        if (t === "MultiPolygon") return "Polygon";
        return t;
      };
    case "$id":
      return f => f.id;
    default:
      return f => f.properties[key];
  }
}

function initSourceFilter(styles) {
  const filters = styles.map(initLayerFilter);

  return function(source, z) {
    return filters.reduce((d, f) => Object.assign(d, f(source, z)), {});
  };
}

function initLayerFilter(style) {
  const { id, type: styleType, filter,
    minzoom = 0, maxzoom = 99,
    "source-layer": sourceLayer,
  } = style;

  const filterObject = composeFilters(getGeomFilter(styleType), filter);
  const parsedFilter = buildFeatureFilter(filterObject);

  return function(source, zoom) {
    // source is a dictionary of FeatureCollections, keyed on source-layer
    if (!source || zoom < minzoom || maxzoom < zoom) return;

    const layer = source[sourceLayer];
    if (!layer) return;

    const { type, extent, features: rawFeatures } = layer;
    const features = rawFeatures.filter(parsedFilter);
    if (features.length > 0) return { [id]: { type, extent, features } };
  };
}

function composeFilters(filter1, filter2) {
  if (!filter1) return filter2;
  if (!filter2) return filter1;
  return ["all", filter1, filter2];
}

function getGeomFilter(type) {
  switch (type) {
    case "circle":
      return ["==", "$type", "Point"];
    case "line":
      return ["!=", "$type", "Point"]; // Could be LineString or Polygon
    case "fill":
      return ["==", "$type", "Polygon"];
    case "symbol":
      return ["==", "$type", "Point"]; // TODO: implement line geom labels
    default:
      return; // No condition on geometry
  }
}

/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
var read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = (nBytes * 8) - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
};

var write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = (nBytes * 8) - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
};

var ieee754 = {
	read: read,
	write: write
};

var pbf = Pbf;



function Pbf(buf) {
    this.buf = ArrayBuffer.isView && ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf || 0);
    this.pos = 0;
    this.type = 0;
    this.length = this.buf.length;
}

Pbf.Varint  = 0; // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
Pbf.Fixed64 = 1; // 64-bit: double, fixed64, sfixed64
Pbf.Bytes   = 2; // length-delimited: string, bytes, embedded messages, packed repeated fields
Pbf.Fixed32 = 5; // 32-bit: float, fixed32, sfixed32

var SHIFT_LEFT_32 = (1 << 16) * (1 << 16),
    SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32;

// Threshold chosen based on both benchmarking and knowledge about browser string
// data structures (which currently switch structure types at 12 bytes or more)
var TEXT_DECODER_MIN_LENGTH = 12;
var utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf8');

Pbf.prototype = {

    destroy: function() {
        this.buf = null;
    },

    // === READING =================================================================

    readFields: function(readField, result, end) {
        end = end || this.length;

        while (this.pos < end) {
            var val = this.readVarint(),
                tag = val >> 3,
                startPos = this.pos;

            this.type = val & 0x7;
            readField(tag, result, this);

            if (this.pos === startPos) this.skip(val);
        }
        return result;
    },

    readMessage: function(readField, result) {
        return this.readFields(readField, result, this.readVarint() + this.pos);
    },

    readFixed32: function() {
        var val = readUInt32(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    readSFixed32: function() {
        var val = readInt32(this.buf, this.pos);
        this.pos += 4;
        return val;
    },

    // 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

    readFixed64: function() {
        var val = readUInt32(this.buf, this.pos) + readUInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    },

    readSFixed64: function() {
        var val = readUInt32(this.buf, this.pos) + readInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32;
        this.pos += 8;
        return val;
    },

    readFloat: function() {
        var val = ieee754.read(this.buf, this.pos, true, 23, 4);
        this.pos += 4;
        return val;
    },

    readDouble: function() {
        var val = ieee754.read(this.buf, this.pos, true, 52, 8);
        this.pos += 8;
        return val;
    },

    readVarint: function(isSigned) {
        var buf = this.buf,
            val, b;

        b = buf[this.pos++]; val  =  b & 0x7f;        if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 7;  if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 14; if (b < 0x80) return val;
        b = buf[this.pos++]; val |= (b & 0x7f) << 21; if (b < 0x80) return val;
        b = buf[this.pos];   val |= (b & 0x0f) << 28;

        return readVarintRemainder(val, isSigned, this);
    },

    readVarint64: function() { // for compatibility with v2.0.1
        return this.readVarint(true);
    },

    readSVarint: function() {
        var num = this.readVarint();
        return num % 2 === 1 ? (num + 1) / -2 : num / 2; // zigzag encoding
    },

    readBoolean: function() {
        return Boolean(this.readVarint());
    },

    readString: function() {
        var end = this.readVarint() + this.pos;
        var pos = this.pos;
        this.pos = end;

        if (end - pos >= TEXT_DECODER_MIN_LENGTH && utf8TextDecoder) {
            // longer strings are fast with the built-in browser TextDecoder API
            return readUtf8TextDecoder(this.buf, pos, end);
        }
        // short strings are fast with our custom implementation
        return readUtf8(this.buf, pos, end);
    },

    readBytes: function() {
        var end = this.readVarint() + this.pos,
            buffer = this.buf.subarray(this.pos, end);
        this.pos = end;
        return buffer;
    },

    // verbose for performance reasons; doesn't affect gzipped size

    readPackedVarint: function(arr, isSigned) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readVarint(isSigned));
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readVarint(isSigned));
        return arr;
    },
    readPackedSVarint: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readSVarint());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSVarint());
        return arr;
    },
    readPackedBoolean: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readBoolean());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readBoolean());
        return arr;
    },
    readPackedFloat: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readFloat());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFloat());
        return arr;
    },
    readPackedDouble: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readDouble());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readDouble());
        return arr;
    },
    readPackedFixed32: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readFixed32());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed32());
        return arr;
    },
    readPackedSFixed32: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readSFixed32());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed32());
        return arr;
    },
    readPackedFixed64: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readFixed64());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readFixed64());
        return arr;
    },
    readPackedSFixed64: function(arr) {
        if (this.type !== Pbf.Bytes) return arr.push(this.readSFixed64());
        var end = readPackedEnd(this);
        arr = arr || [];
        while (this.pos < end) arr.push(this.readSFixed64());
        return arr;
    },

    skip: function(val) {
        var type = val & 0x7;
        if (type === Pbf.Varint) while (this.buf[this.pos++] > 0x7f) {}
        else if (type === Pbf.Bytes) this.pos = this.readVarint() + this.pos;
        else if (type === Pbf.Fixed32) this.pos += 4;
        else if (type === Pbf.Fixed64) this.pos += 8;
        else throw new Error('Unimplemented type: ' + type);
    },

    // === WRITING =================================================================

    writeTag: function(tag, type) {
        this.writeVarint((tag << 3) | type);
    },

    realloc: function(min) {
        var length = this.length || 16;

        while (length < this.pos + min) length *= 2;

        if (length !== this.length) {
            var buf = new Uint8Array(length);
            buf.set(this.buf);
            this.buf = buf;
            this.length = length;
        }
    },

    finish: function() {
        this.length = this.pos;
        this.pos = 0;
        return this.buf.subarray(0, this.length);
    },

    writeFixed32: function(val) {
        this.realloc(4);
        writeInt32(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeSFixed32: function(val) {
        this.realloc(4);
        writeInt32(this.buf, val, this.pos);
        this.pos += 4;
    },

    writeFixed64: function(val) {
        this.realloc(8);
        writeInt32(this.buf, val & -1, this.pos);
        writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
        this.pos += 8;
    },

    writeSFixed64: function(val) {
        this.realloc(8);
        writeInt32(this.buf, val & -1, this.pos);
        writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4);
        this.pos += 8;
    },

    writeVarint: function(val) {
        val = +val || 0;

        if (val > 0xfffffff || val < 0) {
            writeBigVarint(val, this);
            return;
        }

        this.realloc(4);

        this.buf[this.pos++] =           val & 0x7f  | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0); if (val <= 0x7f) return;
        this.buf[this.pos++] =   (val >>> 7) & 0x7f;
    },

    writeSVarint: function(val) {
        this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2);
    },

    writeBoolean: function(val) {
        this.writeVarint(Boolean(val));
    },

    writeString: function(str) {
        str = String(str);
        this.realloc(str.length * 4);

        this.pos++; // reserve 1 byte for short string length

        var startPos = this.pos;
        // write the string directly to the buffer and see how much was written
        this.pos = writeUtf8(this.buf, str, this.pos);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeFloat: function(val) {
        this.realloc(4);
        ieee754.write(this.buf, val, this.pos, true, 23, 4);
        this.pos += 4;
    },

    writeDouble: function(val) {
        this.realloc(8);
        ieee754.write(this.buf, val, this.pos, true, 52, 8);
        this.pos += 8;
    },

    writeBytes: function(buffer) {
        var len = buffer.length;
        this.writeVarint(len);
        this.realloc(len);
        for (var i = 0; i < len; i++) this.buf[this.pos++] = buffer[i];
    },

    writeRawMessage: function(fn, obj) {
        this.pos++; // reserve 1 byte for short message length

        // write the message directly to the buffer and see how much was written
        var startPos = this.pos;
        fn(obj, this);
        var len = this.pos - startPos;

        if (len >= 0x80) makeRoomForExtraLength(startPos, len, this);

        // finally, write the message length in the reserved place and restore the position
        this.pos = startPos - 1;
        this.writeVarint(len);
        this.pos += len;
    },

    writeMessage: function(tag, fn, obj) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeRawMessage(fn, obj);
    },

    writePackedVarint:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedVarint, arr);   },
    writePackedSVarint:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSVarint, arr);  },
    writePackedBoolean:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedBoolean, arr);  },
    writePackedFloat:    function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFloat, arr);    },
    writePackedDouble:   function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedDouble, arr);   },
    writePackedFixed32:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed32, arr);  },
    writePackedSFixed32: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed32, arr); },
    writePackedFixed64:  function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedFixed64, arr);  },
    writePackedSFixed64: function(tag, arr) { if (arr.length) this.writeMessage(tag, writePackedSFixed64, arr); },

    writeBytesField: function(tag, buffer) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeBytes(buffer);
    },
    writeFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeFixed32(val);
    },
    writeSFixed32Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeSFixed32(val);
    },
    writeFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeFixed64(val);
    },
    writeSFixed64Field: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeSFixed64(val);
    },
    writeVarintField: function(tag, val) {
        this.writeTag(tag, Pbf.Varint);
        this.writeVarint(val);
    },
    writeSVarintField: function(tag, val) {
        this.writeTag(tag, Pbf.Varint);
        this.writeSVarint(val);
    },
    writeStringField: function(tag, str) {
        this.writeTag(tag, Pbf.Bytes);
        this.writeString(str);
    },
    writeFloatField: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed32);
        this.writeFloat(val);
    },
    writeDoubleField: function(tag, val) {
        this.writeTag(tag, Pbf.Fixed64);
        this.writeDouble(val);
    },
    writeBooleanField: function(tag, val) {
        this.writeVarintField(tag, Boolean(val));
    }
};

function readVarintRemainder(l, s, p) {
    var buf = p.buf,
        h, b;

    b = buf[p.pos++]; h  = (b & 0x70) >> 4;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 3;  if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 10; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 17; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x7f) << 24; if (b < 0x80) return toNum(l, h, s);
    b = buf[p.pos++]; h |= (b & 0x01) << 31; if (b < 0x80) return toNum(l, h, s);

    throw new Error('Expected varint not more than 10 bytes');
}

function readPackedEnd(pbf) {
    return pbf.type === Pbf.Bytes ?
        pbf.readVarint() + pbf.pos : pbf.pos + 1;
}

function toNum(low, high, isSigned) {
    if (isSigned) {
        return high * 0x100000000 + (low >>> 0);
    }

    return ((high >>> 0) * 0x100000000) + (low >>> 0);
}

function writeBigVarint(val, pbf) {
    var low, high;

    if (val >= 0) {
        low  = (val % 0x100000000) | 0;
        high = (val / 0x100000000) | 0;
    } else {
        low  = ~(-val % 0x100000000);
        high = ~(-val / 0x100000000);

        if (low ^ 0xffffffff) {
            low = (low + 1) | 0;
        } else {
            low = 0;
            high = (high + 1) | 0;
        }
    }

    if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
        throw new Error('Given varint doesn\'t fit into 10 bytes');
    }

    pbf.realloc(10);

    writeBigVarintLow(low, high, pbf);
    writeBigVarintHigh(high, pbf);
}

function writeBigVarintLow(low, high, pbf) {
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos++] = low & 0x7f | 0x80; low >>>= 7;
    pbf.buf[pbf.pos]   = low & 0x7f;
}

function writeBigVarintHigh(high, pbf) {
    var lsb = (high & 0x07) << 4;

    pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0); if (!high) return;
    pbf.buf[pbf.pos++]  = high & 0x7f;
}

function makeRoomForExtraLength(startPos, len, pbf) {
    var extraLen =
        len <= 0x3fff ? 1 :
        len <= 0x1fffff ? 2 :
        len <= 0xfffffff ? 3 : Math.floor(Math.log(len) / (Math.LN2 * 7));

    // if 1 byte isn't enough for encoding message length, shift the data to the right
    pbf.realloc(extraLen);
    for (var i = pbf.pos - 1; i >= startPos; i--) pbf.buf[i + extraLen] = pbf.buf[i];
}

function writePackedVarint(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeVarint(arr[i]);   }
function writePackedSVarint(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeSVarint(arr[i]);  }
function writePackedFloat(arr, pbf)    { for (var i = 0; i < arr.length; i++) pbf.writeFloat(arr[i]);    }
function writePackedDouble(arr, pbf)   { for (var i = 0; i < arr.length; i++) pbf.writeDouble(arr[i]);   }
function writePackedBoolean(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeBoolean(arr[i]);  }
function writePackedFixed32(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed32(arr[i]);  }
function writePackedSFixed32(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed32(arr[i]); }
function writePackedFixed64(arr, pbf)  { for (var i = 0; i < arr.length; i++) pbf.writeFixed64(arr[i]);  }
function writePackedSFixed64(arr, pbf) { for (var i = 0; i < arr.length; i++) pbf.writeSFixed64(arr[i]); }

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

function readUInt32(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] * 0x1000000);
}

function writeInt32(buf, val, pos) {
    buf[pos] = val;
    buf[pos + 1] = (val >>> 8);
    buf[pos + 2] = (val >>> 16);
    buf[pos + 3] = (val >>> 24);
}

function readInt32(buf, pos) {
    return ((buf[pos]) |
        (buf[pos + 1] << 8) |
        (buf[pos + 2] << 16)) +
        (buf[pos + 3] << 24);
}

function readUtf8(buf, pos, end) {
    var str = '';
    var i = pos;

    while (i < end) {
        var b0 = buf[i];
        var c = null; // codepoint
        var bytesPerSequence =
            b0 > 0xEF ? 4 :
            b0 > 0xDF ? 3 :
            b0 > 0xBF ? 2 : 1;

        if (i + bytesPerSequence > end) break;

        var b1, b2, b3;

        if (bytesPerSequence === 1) {
            if (b0 < 0x80) {
                c = b0;
            }
        } else if (bytesPerSequence === 2) {
            b1 = buf[i + 1];
            if ((b1 & 0xC0) === 0x80) {
                c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F);
                if (c <= 0x7F) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 3) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F);
                if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) {
                    c = null;
                }
            }
        } else if (bytesPerSequence === 4) {
            b1 = buf[i + 1];
            b2 = buf[i + 2];
            b3 = buf[i + 3];
            if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80 && (b3 & 0xC0) === 0x80) {
                c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F);
                if (c <= 0xFFFF || c >= 0x110000) {
                    c = null;
                }
            }
        }

        if (c === null) {
            c = 0xFFFD;
            bytesPerSequence = 1;

        } else if (c > 0xFFFF) {
            c -= 0x10000;
            str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800);
            c = 0xDC00 | c & 0x3FF;
        }

        str += String.fromCharCode(c);
        i += bytesPerSequence;
    }

    return str;
}

function readUtf8TextDecoder(buf, pos, end) {
    return utf8TextDecoder.decode(buf.subarray(pos, end));
}

function writeUtf8(buf, str, pos) {
    for (var i = 0, c, lead; i < str.length; i++) {
        c = str.charCodeAt(i); // code point

        if (c > 0xD7FF && c < 0xE000) {
            if (lead) {
                if (c < 0xDC00) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                    lead = c;
                    continue;
                } else {
                    c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000;
                    lead = null;
                }
            } else {
                if (c > 0xDBFF || (i + 1 === str.length)) {
                    buf[pos++] = 0xEF;
                    buf[pos++] = 0xBF;
                    buf[pos++] = 0xBD;
                } else {
                    lead = c;
                }
                continue;
            }
        } else if (lead) {
            buf[pos++] = 0xEF;
            buf[pos++] = 0xBF;
            buf[pos++] = 0xBD;
            lead = null;
        }

        if (c < 0x80) {
            buf[pos++] = c;
        } else {
            if (c < 0x800) {
                buf[pos++] = c >> 0x6 | 0xC0;
            } else {
                if (c < 0x10000) {
                    buf[pos++] = c >> 0xC | 0xE0;
                } else {
                    buf[pos++] = c >> 0x12 | 0xF0;
                    buf[pos++] = c >> 0xC & 0x3F | 0x80;
                }
                buf[pos++] = c >> 0x6 & 0x3F | 0x80;
            }
            buf[pos++] = c & 0x3F | 0x80;
        }
    }
    return pos;
}

class AlphaImage {
  // See mapbox-gl-js/src/util/image.js
  constructor(size, data) {
    createImage(this, size, 1, data);
  }

  resize(size) {
    resizeImage(this, size, 1);
  }

  clone() {
    return new AlphaImage(
      { width: this.width, height: this.height },
      new Uint8Array(this.data)
    );
  }

  static copy(srcImg, dstImg, srcPt, dstPt, size) {
    copyImage(srcImg, dstImg, srcPt, dstPt, size, 1);
  }
}

function createImage(image, { width, height }, channels, data) {
  if (!data) {
    data = new Uint8Array(width * height * channels);
  } else if (data.length !== width * height * channels) {
    throw new RangeError('mismatched image size');
  }
  return Object.assign(image, { width, height, data });
}

function resizeImage(image, { width, height }, channels) {
  if (width === image.width && height === image.height) return;

  const size = { 
    width: Math.min(image.width, width),
    height: Math.min(image.height, height),
  };

  const newImage = createImage({}, { width, height }, channels);

  copyImage(image, newImage, { x: 0, y: 0 }, { x: 0, y: 0 }, size, channels);

  Object.assign(image, { width, height, data: newImage.data });
}

function copyImage(srcImg, dstImg, srcPt, dstPt, size, channels) {
  if (size.width === 0 || size.height === 0) return dstImg;

  if (outOfRange(srcPt, size, srcImg)) {
    throw new RangeError('out of range source coordinates for image copy');
  }
  if (outOfRange(dstPt, size, dstImg)) {
    throw new RangeError('out of range destination coordinates for image copy');
  }

  const srcData = srcImg.data;
  const dstData = dstImg.data;

  console.assert(
    srcData !== dstData,
    "copyImage: src and dst data are identical!"
  );

  for (let y = 0; y < size.height; y++) {
    const srcOffset = ((srcPt.y + y) * srcImg.width + srcPt.x) * channels;
    const dstOffset = ((dstPt.y + y) * dstImg.width + dstPt.x) * channels;
    for (let i = 0; i < size.width * channels; i++) {
      dstData[dstOffset + i] = srcData[srcOffset + i];
    }
  }

  return dstImg;
}

function outOfRange(point, size, image) {
  let { width, height } = size;
  return (
    width > image.width ||
    height > image.height ||
    point.x > image.width - width ||
    point.y > image.height - height
  );
}

const GLYPH_PBF_BORDER = 3;

function parseGlyphPbf(data) {
  // See mapbox-gl-js/src/style/parse_glyph_pbf.js
  // Input is an ArrayBuffer, which will be read as a Uint8Array
  return new pbf(data).readFields(readFontstacks, []);
}

function readFontstacks(tag, glyphs, pbf) {
  if (tag === 1) pbf.readMessage(readFontstack, glyphs);
}

function readFontstack(tag, glyphs, pbf) {
  if (tag !== 3) return;

  const glyph = pbf.readMessage(readGlyph, {});
  const { id, bitmap, width, height, left, top, advance } = glyph;

  const borders = 2 * GLYPH_PBF_BORDER;
  const size = { width: width + borders, height: height + borders };

  glyphs.push({
    id,
    bitmap: new AlphaImage(size, bitmap),
    metrics: { width, height, left, top, advance }
  });
}

function readGlyph(tag, glyph, pbf) {
  if (tag === 1) glyph.id = pbf.readVarint();
  else if (tag === 2) glyph.bitmap = pbf.readBytes();
  else if (tag === 3) glyph.width = pbf.readVarint();
  else if (tag === 4) glyph.height = pbf.readVarint();
  else if (tag === 5) glyph.left = pbf.readSVarint();
  else if (tag === 6) glyph.top = pbf.readSVarint();
  else if (tag === 7) glyph.advance = pbf.readVarint();
}

function initGlyphCache(endpoint) {
  const fonts = {};

  function getBlock(font, range) {
    const first = range * 256;
    const last = first + 255;
    const href = endpoint
      .replace('{fontstack}', font.split(" ").join("%20"))
      .replace('{range}', first + "-" + last);

    return fetch(href)
      .then(getArrayBuffer)
      .then(parseGlyphPbf)
      .then(glyphs => glyphs.reduce((d, g) => (d[g.id] = g, d), {}));
  }

  return function(font, code) {
    // 1. Find the 256-char block containing this code
    if (code > 65535) throw Error('glyph codes > 65535 not supported');
    const range = Math.floor(code / 256);

    // 2. Get the Promise for the retrieval and parsing of the block
    const blocks = fonts[font] || (fonts[font] = {});
    const block = blocks[range] || (blocks[range] = getBlock(font, range));

    // 3. Return a Promise that resolves to the requested glyph
    // NOTE: may be undefined! if the API returns a sparse or empty block
    return block.then(glyphs => glyphs[code]);
  };
}

function getArrayBuffer(response) {
  if (!response.ok) throw Error(response.status + " " + response.statusText);
  return response.arrayBuffer();
}

function potpack(boxes) {

    // calculate total box area and maximum box width
    let area = 0;
    let maxWidth = 0;

    for (const box of boxes) {
        area += box.w * box.h;
        maxWidth = Math.max(maxWidth, box.w);
    }

    // sort the boxes for insertion by height, descending
    boxes.sort((a, b) => b.h - a.h);

    // aim for a squarish resulting container,
    // slightly adjusted for sub-100% space utilization
    const startWidth = Math.max(Math.ceil(Math.sqrt(area / 0.95)), maxWidth);

    // start with a single empty space, unbounded at the bottom
    const spaces = [{x: 0, y: 0, w: startWidth, h: Infinity}];

    let width = 0;
    let height = 0;

    for (const box of boxes) {
        // look through spaces backwards so that we check smaller spaces first
        for (let i = spaces.length - 1; i >= 0; i--) {
            const space = spaces[i];

            // look for empty spaces that can accommodate the current box
            if (box.w > space.w || box.h > space.h) continue;

            // found the space; add the box to its top-left corner
            // |-------|-------|
            // |  box  |       |
            // |_______|       |
            // |         space |
            // |_______________|
            box.x = space.x;
            box.y = space.y;

            height = Math.max(height, box.y + box.h);
            width = Math.max(width, box.x + box.w);

            if (box.w === space.w && box.h === space.h) {
                // space matches the box exactly; remove it
                const last = spaces.pop();
                if (i < spaces.length) spaces[i] = last;

            } else if (box.h === space.h) {
                // space matches the box height; update it accordingly
                // |-------|---------------|
                // |  box  | updated space |
                // |_______|_______________|
                space.x += box.w;
                space.w -= box.w;

            } else if (box.w === space.w) {
                // space matches the box width; update it accordingly
                // |---------------|
                // |      box      |
                // |_______________|
                // | updated space |
                // |_______________|
                space.y += box.h;
                space.h -= box.h;

            } else {
                // otherwise the box splits the space into two spaces
                // |-------|-----------|
                // |  box  | new space |
                // |_______|___________|
                // | updated space     |
                // |___________________|
                spaces.push({
                    x: space.x + box.w,
                    y: space.y,
                    w: space.w - box.w,
                    h: box.h
                });
                space.y += box.h;
                space.h -= box.h;
            }
            break;
        }
    }

    return {
        w: width, // container width
        h: height, // container height
        fill: (area / (width * height)) || 0 // space utilization
    };
}

const ATLAS_PADDING = 1;

function buildAtlas(fonts) {
  // See mapbox-gl-js/src/render/glyph_atlas.js

  // Construct position objects (metrics and rects) for each glyph
  const positions = Object.entries(fonts)
    .reduce((pos, [font, glyphs]) => {
      pos[font] = getPositions(glyphs);
      return pos;
    }, {});

  // Figure out how to pack all the bitmaps into one image
  // NOTE: modifies the rects in the positions object, in place!
  const rects = Object.values(positions)
    .flatMap(fontPos => Object.values(fontPos))
    .map(p => p.rect);
  const { w, h } = potpack(rects);

  // Using the updated rects, copy all the bitmaps into one image
  const image = new AlphaImage({ width: w || 1, height: h || 1 });
  Object.entries(fonts).forEach(([font, glyphs]) => {
    let fontPos = positions[font];
    glyphs.forEach(glyph => copyGlyphBitmap(glyph, fontPos, image));
  });

  return { image, positions };
}

function getPositions(glyphs) {
  return glyphs.reduce((dict, glyph) => {
    let pos = getPosition(glyph);
    if (pos) dict[glyph.id] = pos;
    return dict;
  }, {});
}

function getPosition(glyph) {
  let { bitmap: { width, height }, metrics } = glyph;
  if (width === 0 || height === 0) return;

  // Construct a preliminary rect, positioned at the origin for now
  let w = width + 2 * ATLAS_PADDING;
  let h = height + 2 * ATLAS_PADDING;
  let rect = { x: 0, y: 0, w, h };

  return { metrics, rect };
}

function copyGlyphBitmap(glyph, positions, image) {
  let { id, bitmap, metrics } = glyph;
  let position = positions[id];
  if (!position) return;

  let srcPt = { x: 0, y: 0 };
  let { x, y } = position.rect;
  let dstPt = { x: x + ATLAS_PADDING, y: y + ATLAS_PADDING };
  AlphaImage.copy(bitmap, image, srcPt, dstPt, bitmap);
}

function initGetter(urlTemplate, key) {
  // Check if url is valid
  const urlOK = (
    (typeof urlTemplate === "string" || urlTemplate instanceof String) &&
    urlTemplate.slice(0, 4) === "http"
  );
  if (!urlOK) return console.log("sdf-manager: no valid glyphs URL!");

  // Put in the API key, if supplied
  const endpoint = (key)
    ? urlTemplate.replace('{key}', key)
    : urlTemplate;

  const getGlyph = initGlyphCache(endpoint);

  return function(fontCodes) {
    // fontCodes = { font1: [code1, code2...], font2: ... }
    const fontGlyphs = {};

    const promises = Object.entries(fontCodes).map(([font, codes]) => {
      let requests = Array.from(codes, code => getGlyph(font, code));

      return Promise.all(requests).then(glyphs => {
        fontGlyphs[font] = glyphs.filter(g => g !== undefined);
      });
    });

    return Promise.all(promises).then(() => {
      return buildAtlas(fontGlyphs);
    });
  };
}

function getTokenParser(tokenText) {
  if (!tokenText) return () => undefined;
  const tokenPattern = /{([^{}]+)}/g;

  // We break tokenText into pieces that are either plain text or tokens,
  // then construct an array of functions to parse each piece
  var tokenFuncs = [];
  var charIndex  = 0;
  while (charIndex < tokenText.length) {
    // Find the next token
    let result = tokenPattern.exec(tokenText);

    if (!result) {
      // No tokens left. Parse the plain text after the last token
      let str = tokenText.substring(charIndex);
      tokenFuncs.push(props => str);
      break;
    } else if (result.index > charIndex) {
      // There is some plain text before the token
      let str = tokenText.substring(charIndex, result.index);
      tokenFuncs.push(props => str);
    }

    // Add a function to process the current token
    let token = result[1];
    tokenFuncs.push(props => props[token]);
    charIndex = tokenPattern.lastIndex;
  }
  
  // We now have an array of functions returning either a text string or
  // a feature property
  // Return a function that assembles everything
  return function(properties) {
    return tokenFuncs.reduce(concat, "");
    function concat(str, tokenFunc) {
      let text = tokenFunc(properties) || "";
      return str += text;
    }
  };
}

function initAtlasGetter({ parsedStyles, glyphEndpoint }) {
  const getAtlas = initGetter(glyphEndpoint);

  const textGetters = parsedStyles
    .filter(s => s.type === "symbol")
    .reduce((d, s) => (d[s.id] = initTextGetter(s), d), {});

  return function(layers, zoom) {
    const fonts = Object.entries(layers).reduce((d, [id, layer]) => {
      const getCharCodes = textGetters[id];
      if (!getCharCodes) return d;

      // NOTE: MODIFIES layer.features IN PLACE
      layer.features.forEach(f => getCharCodes(f, zoom, d));
      return d;
    }, {});

    return getAtlas(fonts);
  };
}

function initTextGetter(style) {
  const layout = style.layout;

  return function(feature, zoom, fonts) {
    // Get the label text from feature properties
    const textField = layout["text-field"](zoom, feature);
    const text = getTokenParser(textField)(feature.properties);
    if (!text) return;

    // Apply the text transform, and convert to character codes
    const transformCode = layout["text-transform"](zoom, feature);
    const transformedText = getTextTransform(transformCode)(text);
    const charCodes = transformedText.split("").map(c => c.charCodeAt(0));
    if (!charCodes.length) return;

    // Update the set of character codes for the appropriate font
    const font = layout["text-font"](zoom, feature);
    const charSet = fonts[font] || (fonts[font] = new Set());
    charCodes.forEach(charSet.add, charSet);

    // Add font name and character codes to the feature (MODIFY IN PLACE!)
    Object.assign(feature, { font, charCodes });
  };
}

function getTextTransform(code) {
  switch (code) {
    case "uppercase":
      return f => f.toUpperCase();
    case "lowercase":
      return f => f.toLowerCase();
    case "none":
    default:
      return f => f;
  }
}

function initCircleParsing(style) {
  const { paint } = style;

  const dataFuncs = [
    [paint["circle-radius"],  "radius"],
    [paint["circle-color"],   "color"],
    [paint["circle-opacity"], "opacity"],
  ].filter(([get, key]) => get.type === "property");

  return function(feature, { z, x, y }) {
    const circlePos = flattenPoints(feature.geometry);
    if (!circlePos) return;

    const length = circlePos.length / 2;
    
    const buffers = { 
      circlePos,
      tileCoords: Array.from({ length }).flatMap(v => [x, y, z]),
    };

    dataFuncs.forEach(([get, key]) => {
      let val = get(null, feature);
      buffers[key] = Array.from({ length }).flatMap(v => val);
    });

    return buffers;
  };
}

function flattenPoints(geometry) {
  const { type, coordinates } = geometry;

  switch (type) {
    case "Point":
      return coordinates;
    case "MultiPoint":
      return coordinates.flat();
    default:
      return;
  }
}

function initLineParsing(style) {
  const { paint } = style;

  // TODO: check for property-dependence of lineWidth, lineGapWidth
  const dataFuncs = [
    [paint["line-color"], "color"],
    [paint["line-opacity"], "opacity"],
  ].filter(([get, key]) => get.type === "property");

  return function(feature, { z, x, y }) {
    const lines = flattenLines(feature.geometry);
    if (!lines) return;

    const length = lines.length / 3;

    const buffers = {
      lines,
      tileCoords: Array.from({ length }).flatMap(v => [x, y, z]),
    };

    dataFuncs.forEach(([get, key]) => {
      let val = get(null, feature);
      buffers[key] = Array.from({ length }).flatMap(v => val);
    });

    return buffers;
  };
}

function flattenLines(geometry) {
  let { type, coordinates } = geometry;

  switch (type) {
    case "LineString":
      return flattenLineString(coordinates);
    case "MultiLineString":
      return coordinates.flatMap(flattenLineString);
    case "Polygon":
      return flattenPolygon(coordinates);
    case "MultiPolygon":
      return coordinates.flatMap(flattenPolygon);
    default:
      return;
  }
}

function flattenLineString(line) {
  return [
    ...[...line[0], -2.0],
    ...line.flatMap(([x, y]) => [x, y, 0.0]),
    ...[...line[line.length - 1], -2.0]
  ];
}

function flattenPolygon(rings) {
  return rings.flatMap(flattenLinearRing);
}

function flattenLinearRing(ring) {
  // Definition of linear ring:
  // ring.length > 3 && ring[ring.length - 1] == ring[0]
  return [
    ...[...ring[ring.length - 2], -2.0],
    ...ring.flatMap(([x, y]) => [x, y, 0.0]),
    ...[...ring[1], -2.0]
  ];
}

var earcut_1 = earcut;
var default_1 = earcut;

function earcut(data, holeIndices, dim) {

    dim = dim || 2;

    var hasHoles = holeIndices && holeIndices.length,
        outerLen = hasHoles ? holeIndices[0] * dim : data.length,
        outerNode = linkedList(data, 0, outerLen, dim, true),
        triangles = [];

    if (!outerNode || outerNode.next === outerNode.prev) return triangles;

    var minX, minY, maxX, maxY, x, y, invSize;

    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

    // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
    if (data.length > 80 * dim) {
        minX = maxX = data[0];
        minY = maxY = data[1];

        for (var i = dim; i < outerLen; i += dim) {
            x = data[i];
            y = data[i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        // minX, minY and invSize are later used to transform coords into integers for z-order calculation
        invSize = Math.max(maxX - minX, maxY - minY);
        invSize = invSize !== 0 ? 1 / invSize : 0;
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, invSize);

    return triangles;
}

// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(data, start, end, dim, clockwise) {
    var i, last;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
        for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
        for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }

    if (last && equals(last, last.next)) {
        removeNode(last);
        last = last.next;
    }

    return last;
}

// eliminate colinear or duplicate points
function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;

    var p = start,
        again;
    do {
        again = false;

        if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
            removeNode(p);
            p = end = p.prev;
            if (p === p.next) break;
            again = true;

        } else {
            p = p.next;
        }
    } while (again || p !== end);

    return end;
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
    if (!ear) return;

    // interlink polygon nodes in z-order
    if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

    var stop = ear,
        prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;

        if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
            // cut off the triangle
            triangles.push(prev.i / dim);
            triangles.push(ear.i / dim);
            triangles.push(next.i / dim);

            removeNode(ear);

            // skipping the next vertex leads to less sliver triangles
            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if (ear === stop) {
            // try filtering points and slicing again
            if (!pass) {
                earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);

            // if this didn't work, try curing all small self-intersections locally
            } else if (pass === 1) {
                ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
                earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);

            // as a last resort, try splitting the remaining polygon into two
            } else if (pass === 2) {
                splitEarcut(ear, triangles, dim, minX, minY, invSize);
            }

            break;
        }
    }
}

// check whether a polygon node forms a valid ear with adjacent nodes
function isEar(ear) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    // now make sure we don't have other points inside the potential ear
    var p = ear.next.next;

    while (p !== ear.prev) {
        if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.next;
    }

    return true;
}

function isEarHashed(ear, minX, minY, invSize) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    // triangle bbox; min & max are calculated like this for speed
    var minTX = a.x < b.x ? (a.x < c.x ? a.x : c.x) : (b.x < c.x ? b.x : c.x),
        minTY = a.y < b.y ? (a.y < c.y ? a.y : c.y) : (b.y < c.y ? b.y : c.y),
        maxTX = a.x > b.x ? (a.x > c.x ? a.x : c.x) : (b.x > c.x ? b.x : c.x),
        maxTY = a.y > b.y ? (a.y > c.y ? a.y : c.y) : (b.y > c.y ? b.y : c.y);

    // z-order range for the current triangle bbox;
    var minZ = zOrder(minTX, minTY, minX, minY, invSize),
        maxZ = zOrder(maxTX, maxTY, minX, minY, invSize);

    var p = ear.prevZ,
        n = ear.nextZ;

    // look for points inside the triangle in both directions
    while (p && p.z >= minZ && n && n.z <= maxZ) {
        if (p !== ear.prev && p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;

        if (n !== ear.prev && n !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) &&
            area(n.prev, n, n.next) >= 0) return false;
        n = n.nextZ;
    }

    // look for remaining points in decreasing z-order
    while (p && p.z >= minZ) {
        if (p !== ear.prev && p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;
    }

    // look for remaining points in increasing z-order
    while (n && n.z <= maxZ) {
        if (n !== ear.prev && n !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) &&
            area(n.prev, n, n.next) >= 0) return false;
        n = n.nextZ;
    }

    return true;
}

// go through all polygon nodes and cure small local self-intersections
function cureLocalIntersections(start, triangles, dim) {
    var p = start;
    do {
        var a = p.prev,
            b = p.next.next;

        if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

            triangles.push(a.i / dim);
            triangles.push(p.i / dim);
            triangles.push(b.i / dim);

            // remove two nodes involved
            removeNode(p);
            removeNode(p.next);

            p = start = b;
        }
        p = p.next;
    } while (p !== start);

    return filterPoints(p);
}

// try splitting polygon into two and triangulate them independently
function splitEarcut(start, triangles, dim, minX, minY, invSize) {
    // look for a valid diagonal that divides the polygon into two
    var a = start;
    do {
        var b = a.next.next;
        while (b !== a.prev) {
            if (a.i !== b.i && isValidDiagonal(a, b)) {
                // split the polygon in two by the diagonal
                var c = splitPolygon(a, b);

                // filter colinear points around the cuts
                a = filterPoints(a, a.next);
                c = filterPoints(c, c.next);

                // run earcut on each half
                earcutLinked(a, triangles, dim, minX, minY, invSize);
                earcutLinked(c, triangles, dim, minX, minY, invSize);
                return;
            }
            b = b.next;
        }
        a = a.next;
    } while (a !== start);
}

// link every hole into the outer loop, producing a single-ring polygon without holes
function eliminateHoles(data, holeIndices, outerNode, dim) {
    var queue = [],
        i, len, start, end, list;

    for (i = 0, len = holeIndices.length; i < len; i++) {
        start = holeIndices[i] * dim;
        end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
        list = linkedList(data, start, end, dim, false);
        if (list === list.next) list.steiner = true;
        queue.push(getLeftmost(list));
    }

    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i < queue.length; i++) {
        eliminateHole(queue[i], outerNode);
        outerNode = filterPoints(outerNode, outerNode.next);
    }

    return outerNode;
}

function compareX(a, b) {
    return a.x - b.x;
}

// find a bridge between vertices that connects hole with an outer ring and and link it
function eliminateHole(hole, outerNode) {
    outerNode = findHoleBridge(hole, outerNode);
    if (outerNode) {
        var b = splitPolygon(outerNode, hole);

        // filter collinear points around the cuts
        filterPoints(outerNode, outerNode.next);
        filterPoints(b, b.next);
    }
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
function findHoleBridge(hole, outerNode) {
    var p = outerNode,
        hx = hole.x,
        hy = hole.y,
        qx = -Infinity,
        m;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    do {
        if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
            var x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
            if (x <= hx && x > qx) {
                qx = x;
                if (x === hx) {
                    if (hy === p.y) return p;
                    if (hy === p.next.y) return p.next;
                }
                m = p.x < p.next.x ? p : p.next;
            }
        }
        p = p.next;
    } while (p !== outerNode);

    if (!m) return null;

    if (hx === qx) return m; // hole touches outer segment; pick leftmost endpoint

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    var stop = m,
        mx = m.x,
        my = m.y,
        tanMin = Infinity,
        tan;

    p = m;

    do {
        if (hx >= p.x && p.x >= mx && hx !== p.x &&
                pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

            tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

            if (locallyInside(p, hole) &&
                (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
                m = p;
                tanMin = tan;
            }
        }

        p = p.next;
    } while (p !== stop);

    return m;
}

// whether sector in vertex m contains sector in vertex p in the same coordinates
function sectorContainsSector(m, p) {
    return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

// interlink polygon nodes in z-order
function indexCurve(start, minX, minY, invSize) {
    var p = start;
    do {
        if (p.z === null) p.z = zOrder(p.x, p.y, minX, minY, invSize);
        p.prevZ = p.prev;
        p.nextZ = p.next;
        p = p.next;
    } while (p !== start);

    p.prevZ.nextZ = null;
    p.prevZ = null;

    sortLinked(p);
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
function sortLinked(list) {
    var i, p, q, e, tail, numMerges, pSize, qSize,
        inSize = 1;

    do {
        p = list;
        list = null;
        tail = null;
        numMerges = 0;

        while (p) {
            numMerges++;
            q = p;
            pSize = 0;
            for (i = 0; i < inSize; i++) {
                pSize++;
                q = q.nextZ;
                if (!q) break;
            }
            qSize = inSize;

            while (pSize > 0 || (qSize > 0 && q)) {

                if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                    e = p;
                    p = p.nextZ;
                    pSize--;
                } else {
                    e = q;
                    q = q.nextZ;
                    qSize--;
                }

                if (tail) tail.nextZ = e;
                else list = e;

                e.prevZ = tail;
                tail = e;
            }

            p = q;
        }

        tail.nextZ = null;
        inSize *= 2;

    } while (numMerges > 1);

    return list;
}

// z-order of a point given coords and inverse of the longer side of data bbox
function zOrder(x, y, minX, minY, invSize) {
    // coords are transformed into non-negative 15-bit integer range
    x = 32767 * (x - minX) * invSize;
    y = 32767 * (y - minY) * invSize;

    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
}

// find the leftmost node of a polygon ring
function getLeftmost(start) {
    var p = start,
        leftmost = start;
    do {
        if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
        p = p.next;
    } while (p !== start);

    return leftmost;
}

// check if a point lies within a convex triangle
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
           (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
           (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && // dones't intersect other edges
           (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && // locally visible
            (area(a.prev, a, b.prev) || area(a, b.prev, b)) || // does not create opposite-facing sectors
            equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0); // special zero-length case
}

// signed area of a triangle
function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

// check if two points are equal
function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
}

// check if two segments intersect
function intersects(p1, q1, p2, q2) {
    var o1 = sign(area(p1, q1, p2));
    var o2 = sign(area(p1, q1, q2));
    var o3 = sign(area(p2, q2, p1));
    var o4 = sign(area(p2, q2, q1));

    if (o1 !== o2 && o3 !== o4) return true; // general case

    if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
    if (o2 === 0 && onSegment(p1, q2, q1)) return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
    if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
    if (o4 === 0 && onSegment(p2, q1, q2)) return true; // p2, q2 and q1 are collinear and q1 lies on p2q2

    return false;
}

// for collinear points p, q, r, check if point q lies on segment pr
function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function sign(num) {
    return num > 0 ? 1 : num < 0 ? -1 : 0;
}

// check if a polygon diagonal intersects any polygon segments
function intersectsPolygon(a, b) {
    var p = a;
    do {
        if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
                intersects(p, p.next, a, b)) return true;
        p = p.next;
    } while (p !== a);

    return false;
}

// check if a polygon diagonal is locally inside the polygon
function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ?
        area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
        area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

// check if the middle point of a polygon diagonal is inside the polygon
function middleInside(a, b) {
    var p = a,
        inside = false,
        px = (a.x + b.x) / 2,
        py = (a.y + b.y) / 2;
    do {
        if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
                (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
            inside = !inside;
        p = p.next;
    } while (p !== a);

    return inside;
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
function splitPolygon(a, b) {
    var a2 = new Node(a.i, a.x, a.y),
        b2 = new Node(b.i, b.x, b.y),
        an = a.next,
        bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return b2;
}

// create a node and optionally link it with previous one (in a circular doubly linked list)
function insertNode(i, x, y, last) {
    var p = new Node(i, x, y);

    if (!last) {
        p.prev = p;
        p.next = p;

    } else {
        p.next = last.next;
        p.prev = last;
        last.next.prev = p;
        last.next = p;
    }
    return p;
}

function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;

    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function Node(i, x, y) {
    // vertex index in coordinates array
    this.i = i;

    // vertex coordinates
    this.x = x;
    this.y = y;

    // previous and next vertex nodes in a polygon ring
    this.prev = null;
    this.next = null;

    // z-order curve value
    this.z = null;

    // previous and next nodes in z-order
    this.prevZ = null;
    this.nextZ = null;

    // indicates whether this is a steiner point
    this.steiner = false;
}

// return a percentage difference between the polygon area and its triangulation area;
// used to verify correctness of triangulation
earcut.deviation = function (data, holeIndices, dim, triangles) {
    var hasHoles = holeIndices && holeIndices.length;
    var outerLen = hasHoles ? holeIndices[0] * dim : data.length;

    var polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
    if (hasHoles) {
        for (var i = 0, len = holeIndices.length; i < len; i++) {
            var start = holeIndices[i] * dim;
            var end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
            polygonArea -= Math.abs(signedArea(data, start, end, dim));
        }
    }

    var trianglesArea = 0;
    for (i = 0; i < triangles.length; i += 3) {
        var a = triangles[i] * dim;
        var b = triangles[i + 1] * dim;
        var c = triangles[i + 2] * dim;
        trianglesArea += Math.abs(
            (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
            (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
    }

    return polygonArea === 0 && trianglesArea === 0 ? 0 :
        Math.abs((trianglesArea - polygonArea) / polygonArea);
};

function signedArea(data, start, end, dim) {
    var sum = 0;
    for (var i = start, j = end - dim; i < end; i += dim) {
        sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
        j = i;
    }
    return sum;
}

// turn a polygon in a multi-dimensional array form (e.g. as in GeoJSON) into a form Earcut accepts
earcut.flatten = function (data) {
    var dim = data[0][0].length,
        result = {vertices: [], holes: [], dimensions: dim},
        holeIndex = 0;

    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
            for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
        }
        if (i > 0) {
            holeIndex += data[i - 1].length;
            result.holes.push(holeIndex);
        }
    }
    return result;
};
earcut_1.default = default_1;

function initFillParsing(style) {
  const { paint } = style;

  const dataFuncs = [
    [paint["fill-color"],   "color"],
    [paint["fill-opacity"], "opacity"],
  ].filter(([get, key]) => get.type === "property");

  return function(feature, { z, x, y }) {
    const triangles = triangulate(feature.geometry);
    if (!triangles) return;

    const length = triangles.vertices.length / 2;

    const buffers = {
      position: triangles.vertices,
      indices: triangles.indices,
      tileCoords: Array.from({ length }).flatMap(v => [x, y, z]),
    };

    dataFuncs.forEach(([get, key]) => {
      let val = get(null, feature);
      buffers[key] = Array.from({ length }).flatMap(v => val);
    });

    return buffers;
  };
}

function triangulate(geometry) {
  const { type, coordinates } = geometry;

  switch (type) {
    case "Polygon":
      return indexPolygon(coordinates);
    case "MultiPolygon":
      return coordinates.map(indexPolygon).reduce((acc, cur) => {
        let indexShift = acc.vertices.length / 2;
        acc.vertices.push(...cur.vertices);
        acc.indices.push(...cur.indices.map(h => h + indexShift));
        return acc;
      });
    default:
      return;
  }
}

function indexPolygon(coords) {
  let { vertices, holes, dimensions } = earcut_1.flatten(coords);
  let indices = earcut_1(vertices, holes, dimensions);
  return { vertices, indices };
}

const GLYPH_PBF_BORDER$1 = 3;
const ONE_EM = 24;

const ATLAS_PADDING$1 = 1;

const RECT_BUFFER = GLYPH_PBF_BORDER$1 + ATLAS_PADDING$1;

function layoutLine(glyphs, origin, spacing, scalar) {
  var xCursor = origin[0];
  const y0 = origin[1];

  return glyphs.flatMap(g => {
    let { left, top, advance } = g.metrics;

    let dx = xCursor + left - RECT_BUFFER;
    let dy = y0 - top - RECT_BUFFER;

    xCursor += advance + spacing;

    return [dx, dy, scalar];
  });
}

function getGlyphInfo(feature, atlas) {
  const { font, charCodes } = feature;
  const positions = atlas.positions[font];

  if (!positions || !charCodes || !charCodes.length) return;

  const info = feature.charCodes.map(code => {
    let pos = positions[code];
    if (!pos) return;
    let { metrics, rect } = pos;
    return { code, metrics, rect };
  });

  return info.filter(i => i !== undefined);
}

function getTextBoxShift(anchor) {
  // Shift the top-left corner of the text bounding box
  // by the returned value * bounding box dimensions
  switch (anchor) {
    case "top-left":
      return [ 0.0,  0.0];
    case "top-right":
      return [-1.0,  0.0];
    case "top":
      return [-0.5,  0.0];
    case "bottom-left":
      return [ 0.0, -1.0];
    case "bottom-right":
      return [-1.0, -1.0];
    case "bottom":
      return [-0.5, -1.0];
    case "left":
      return [ 0.0, -0.5];
    case "right":
      return [-1.0, -0.5];
    case "center":
    default:
      return [-0.5, -0.5];
  }
}

function getLineShift(justify, boxShiftX) {
  // Shift the start of the text line (left side) by the
  // returned value * (boundingBoxWidth - lineWidth)
  switch (justify) {
    case "auto":
      return -boxShiftX;
    case "left":
      return 0;
    case "right":
      return 1;
    case "center":
    default:
      return 0.5;
  }
}

const whitespace = {
  // From mapbox-gl-js/src/symbol/shaping.js
  [0x09]: true, // tab
  [0x0a]: true, // newline
  [0x0b]: true, // vertical tab
  [0x0c]: true, // form feed
  [0x0d]: true, // carriage return
  [0x20]: true, // space
};

const breakable = {
  // From mapbox-gl-js/src/symbol/shaping.js
  [0x0a]:   true, // newline
  [0x20]:   true, // space
  [0x26]:   true, // ampersand
  [0x28]:   true, // left parenthesis
  [0x29]:   true, // right parenthesis
  [0x2b]:   true, // plus sign
  [0x2d]:   true, // hyphen-minus
  [0x2f]:   true, // solidus
  [0xad]:   true, // soft hyphen
  [0xb7]:   true, // middle dot
  [0x200b]: true, // zero-width space
  [0x2010]: true, // hyphen
  [0x2013]: true, // en dash
  [0x2027]: true  // interpunct
};

function getBreakPoints(glyphs, spacing, targetWidth) {
  const potentialLineBreaks = [];
  const last = glyphs.length - 1;
  let cursor = 0;

  glyphs.forEach((g, i) => {
    let { code, metrics: { advance } } = g;
    if (!whitespace[code]) cursor += advance + spacing;

    if (i == last) return;
    if (!breakable[code] 
      //&& !charAllowsIdeographicBreaking(code)
    ) return;

    let breakInfo = evaluateBreak(
      i + 1,
      cursor,
      targetWidth,
      potentialLineBreaks,
      calculatePenalty(code, glyphs[i + 1].code),
      false
    );
    potentialLineBreaks.push(breakInfo);
  });

  const lastBreak = evaluateBreak(
    glyphs.length,
    cursor,
    targetWidth,
    potentialLineBreaks,
    0,
    true
  );

  return leastBadBreaks(lastBreak);
}

function leastBadBreaks(lastBreak) {
  if (!lastBreak) return [];
  return leastBadBreaks(lastBreak.priorBreak).concat(lastBreak.index);
}

function evaluateBreak(index, x, targetWidth, breaks, penalty, isLastBreak) {
  // Start by assuming the supplied (index, x) is the first break
  const init = {
    index, x,
    priorBreak: null,
    badness: calculateBadness(x)
  };

  // Now consider all previous possible break points, and
  // return the pair corresponding to the best combination of breaks
  return breaks.reduce((best, prev) => {
    const badness = calculateBadness(x - prev.x) + prev.badness;
    if (badness < best.badness) {
      best.priorBreak = prev;
      best.badness = badness;
    }
    return best;
  }, init);

  function calculateBadness(width) {
    const raggedness = (width - targetWidth) ** 2;

    if (!isLastBreak) return raggedness + Math.abs(penalty) * penalty;

    // Last line: prefer shorter than average
    return (width < targetWidth)
      ? raggedness / 2
      : raggedness * 2;
  }
}

function calculatePenalty(code, nextCode) {
  let penalty = 0;
  // Force break on newline
  if (code === 0x0a) penalty -= 10000;
  // Penalize open parenthesis at end of line
  if (code === 0x28 || code === 0xff08) penalty += 50;
  // Penalize close parenthesis at beginning of line
  if (nextCode === 0x29 || nextCode === 0xff09) penalty += 50;

  return penalty;
}

function splitLines(glyphs, spacing, maxWidth) {
  // glyphs is an Array of Objects with properties { code, metrics, rect }
  // spacing and maxWidth should already be scaled to the same units as
  //   glyph.metrics.advance
  const totalWidth = measureLine(glyphs, spacing);

  const lineCount = Math.ceil(totalWidth / maxWidth);
  if (lineCount < 1) return [];
  
  const targetWidth = totalWidth / lineCount;
  const breakPoints = getBreakPoints(glyphs, spacing, targetWidth);

  return breakLines(glyphs, breakPoints);
}

function measureLine(glyphs, spacing) {
  if (glyphs.length < 1) return 0;

  // No initial value for reduce--so no spacing added for 1st char
  return glyphs.map(g => g.metrics.advance)
    .reduce((a, c) => a + c + spacing);
}

function breakLines(glyphs, breakPoints) {
  let start = 0;

  return breakPoints.map(lineBreak => {
    let line = glyphs.slice(start, lineBreak);

    // Trim whitespace from both ends
    while (line.length && whitespace[line[0].code]) line.shift();
    while (trailingWhiteSpace(line)) line.pop();

    start = lineBreak;
    return line;
  });
}

function trailingWhiteSpace(line) {
  let len = line.length;
  if (!len) return false;
  return whitespace[line[len - 1].code];
}

function initShaper(layout) {
  return function(feature, zoom, atlas) {
    // For each feature, compute a list of info for each character:
    // - x0, y0  defining overall label position
    // - dx, dy  delta positions relative to label position
    // - x, y, w, h  defining the position of the glyph within the atlas

    // 1. Get the glyphs for the characters
    const glyphs = getGlyphInfo(feature, atlas);
    if (!glyphs) return;

    // 2. Split into lines
    const spacing = layout["text-letter-spacing"](zoom, feature) * ONE_EM;
    const maxWidth = layout["text-max-width"](zoom, feature) * ONE_EM;
    const lines = splitLines(glyphs, spacing, maxWidth);
    // TODO: What if no labelText, or it is all whitespace?

    // 3. Get dimensions of lines and overall text box
    const lineWidths = lines.map(line => measureLine(line, spacing));
    const lineHeight = layout["text-line-height"](zoom, feature) * ONE_EM;

    const boxSize = [Math.max(...lineWidths), lines.length * lineHeight];
    const textOffset = layout["text-offset"](zoom, feature)
      .map(c => c * ONE_EM);
    const boxShift = getTextBoxShift( layout["text-anchor"](zoom, feature) );
    const boxOrigin = boxShift.map((c, i) => c * boxSize[i] + textOffset[i]);

    // 4. Compute origins for each line
    const justify = layout["text-justify"](zoom, feature);
    const lineShiftX = getLineShift(justify, boxShift[0]);
    const lineOrigins = lineWidths.map((lineWidth, i) => {
      let x = (boxSize[0] - lineWidth) * lineShiftX + boxOrigin[0];
      let y = i * lineHeight + boxOrigin[1];
      return [x, y];
    });

    // 5. Compute top left corners of the glyphs in each line,
    //    appending the font size scalar for final positioning
    const scalar = layout["text-size"](zoom, feature) / ONE_EM;
    const charPos = lines
      .flatMap((l, i) => layoutLine(l, lineOrigins[i], spacing, scalar));

    // 6. Fill in label origins for each glyph. TODO: assumes Point geometry
    const origin = feature.geometry.coordinates.slice();
    const labelPos = lines.flat()
      .flatMap(g => origin);

    // 7. Collect all the glyph rects
    const sdfRect = lines.flat()
      .flatMap(g => Object.values(g.rect));

    // 8. Compute bounding box for collision checks
    const textPadding = layout["text-padding"](zoom, feature);
    const bbox = [
      boxOrigin[0] * scalar - textPadding,
      boxOrigin[1] * scalar - textPadding,
      (boxOrigin[0] + boxSize[0]) * scalar + textPadding,
      (boxOrigin[1] + boxSize[1]) * scalar + textPadding
    ];

    return { labelPos, charPos, sdfRect, bbox };
  }
}

function initShaping(style) {
  const { layout, paint } = style;

  const shaper = initShaper(layout);

  const dataFuncs = [
    [paint["text-color"],   "color"],
    [paint["text-opacity"], "opacity"],
  ].filter(([get, key]) => get.type === "property");

  return function(feature, tileCoords, atlas, tree) {
    // tree is an RBush from the 'rbush' module. NOTE: will be updated!

    const { z, x, y } = tileCoords;
    const buffers = shaper(feature, z, atlas);
    if (!buffers) return;

    let { labelPos: [x0, y0], bbox } = buffers;
    let box = {
      minX: x0 + bbox[0],
      minY: y0 + bbox[1],
      maxX: x0 + bbox[2],
      maxY: y0 + bbox[3],
    };

    if (tree.collides(box)) return;
    tree.insert(box);

    const length = buffers.labelPos.length / 2;
    buffers.tileCoords = Array.from({ length }).flatMap(v => [x, y, z]);

    dataFuncs.forEach(([get, key]) => {
      let val = get(null, feature);
      buffers[key] = Array.from({ length }).flatMap(v => val);
    });

    // TODO: drop if outside tile?
    return buffers;
  };
}

function initSerializer(style) {
  switch (style.type) {
    case "circle":
      return initCircleParsing(style);
    case "line":
      return initLineParsing(style);
    case "fill":
      return initFillParsing(style);
    case "symbol":
      return initShaping(style);
    default:
      throw Error("tile-gl: unknown serializer type!");
  }
}

function concatBuffers(features) {
  // Create a new Array for each buffer
  const arrays = Object.keys(features[0].buffers)
    .reduce((d, k) => (d[k] = [], d), {});

  // Concatenate the buffers from all the features
  features.forEach(f => appendBuffers(arrays, f.buffers));

  // Convert to TypedArrays
  return Object.entries(arrays).reduce((d, [key, buffer]) => {
    d[key] = (key === "indices")
      ? new Uint32Array(buffer)
      : new Float32Array(buffer);
    return d;
  }, {});
}

function appendBuffers(buffers, newBuffers) {
  const appendix = Object.assign({}, newBuffers);
  if (buffers.indices) {
    let indexShift = buffers.position.length / 2;
    appendix.indices = newBuffers.indices.map(i => i + indexShift);
  }
  Object.keys(buffers).forEach(k => {
    // NOTE: The 'obvious' buffers[k].push(...appendix[k]) fails with
    //  the error "Maximum call stack size exceeded"
    let base = buffers[k];
    appendix[k].forEach(a => base.push(a));
  });
}

function quickselect(arr, k, left, right, compare) {
    quickselectStep(arr, k, left || 0, right || (arr.length - 1), compare || defaultCompare);
}

function quickselectStep(arr, k, left, right, compare) {

    while (right > left) {
        if (right - left > 600) {
            var n = right - left + 1;
            var m = k - left + 1;
            var z = Math.log(n);
            var s = 0.5 * Math.exp(2 * z / 3);
            var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
            var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
            var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
            quickselectStep(arr, k, newLeft, newRight, compare);
        }

        var t = arr[k];
        var i = left;
        var j = right;

        swap(arr, left, k);
        if (compare(arr[right], t) > 0) swap(arr, left, right);

        while (i < j) {
            swap(arr, i, j);
            i++;
            j--;
            while (compare(arr[i], t) < 0) i++;
            while (compare(arr[j], t) > 0) j--;
        }

        if (compare(arr[left], t) === 0) swap(arr, left, j);
        else {
            j++;
            swap(arr, j, right);
        }

        if (j <= k) left = j + 1;
        if (k <= j) right = j - 1;
    }
}

function swap(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

function defaultCompare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

class RBush {
    constructor(maxEntries = 9) {
        // max entries in a node is 9 by default; min node fill is 40% for best performance
        this._maxEntries = Math.max(4, maxEntries);
        this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));
        this.clear();
    }

    all() {
        return this._all(this.data, []);
    }

    search(bbox) {
        let node = this.data;
        const result = [];

        if (!intersects$1(bbox, node)) return result;

        const toBBox = this.toBBox;
        const nodesToSearch = [];

        while (node) {
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const childBBox = node.leaf ? toBBox(child) : child;

                if (intersects$1(bbox, childBBox)) {
                    if (node.leaf) result.push(child);
                    else if (contains(bbox, childBBox)) this._all(child, result);
                    else nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return result;
    }

    collides(bbox) {
        let node = this.data;

        if (!intersects$1(bbox, node)) return false;

        const nodesToSearch = [];
        while (node) {
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const childBBox = node.leaf ? this.toBBox(child) : child;

                if (intersects$1(bbox, childBBox)) {
                    if (node.leaf || contains(bbox, childBBox)) return true;
                    nodesToSearch.push(child);
                }
            }
            node = nodesToSearch.pop();
        }

        return false;
    }

    load(data) {
        if (!(data && data.length)) return this;

        if (data.length < this._minEntries) {
            for (let i = 0; i < data.length; i++) {
                this.insert(data[i]);
            }
            return this;
        }

        // recursively build the tree with the given data from scratch using OMT algorithm
        let node = this._build(data.slice(), 0, data.length - 1, 0);

        if (!this.data.children.length) {
            // save as is if tree is empty
            this.data = node;

        } else if (this.data.height === node.height) {
            // split root if trees have the same height
            this._splitRoot(this.data, node);

        } else {
            if (this.data.height < node.height) {
                // swap trees if inserted one is bigger
                const tmpNode = this.data;
                this.data = node;
                node = tmpNode;
            }

            // insert the small tree into the large tree at appropriate level
            this._insert(node, this.data.height - node.height - 1, true);
        }

        return this;
    }

    insert(item) {
        if (item) this._insert(item, this.data.height - 1);
        return this;
    }

    clear() {
        this.data = createNode([]);
        return this;
    }

    remove(item, equalsFn) {
        if (!item) return this;

        let node = this.data;
        const bbox = this.toBBox(item);
        const path = [];
        const indexes = [];
        let i, parent, goingUp;

        // depth-first iterative tree traversal
        while (node || path.length) {

            if (!node) { // go up
                node = path.pop();
                parent = path[path.length - 1];
                i = indexes.pop();
                goingUp = true;
            }

            if (node.leaf) { // check current node
                const index = findItem(item, node.children, equalsFn);

                if (index !== -1) {
                    // item found, remove the item and condense tree upwards
                    node.children.splice(index, 1);
                    path.push(node);
                    this._condense(path);
                    return this;
                }
            }

            if (!goingUp && !node.leaf && contains(node, bbox)) { // go down
                path.push(node);
                indexes.push(i);
                i = 0;
                parent = node;
                node = node.children[0];

            } else if (parent) { // go right
                i++;
                node = parent.children[i];
                goingUp = false;

            } else node = null; // nothing found
        }

        return this;
    }

    toBBox(item) { return item; }

    compareMinX(a, b) { return a.minX - b.minX; }
    compareMinY(a, b) { return a.minY - b.minY; }

    toJSON() { return this.data; }

    fromJSON(data) {
        this.data = data;
        return this;
    }

    _all(node, result) {
        const nodesToSearch = [];
        while (node) {
            if (node.leaf) result.push(...node.children);
            else nodesToSearch.push(...node.children);

            node = nodesToSearch.pop();
        }
        return result;
    }

    _build(items, left, right, height) {

        const N = right - left + 1;
        let M = this._maxEntries;
        let node;

        if (N <= M) {
            // reached leaf level; return leaf
            node = createNode(items.slice(left, right + 1));
            calcBBox(node, this.toBBox);
            return node;
        }

        if (!height) {
            // target height of the bulk-loaded tree
            height = Math.ceil(Math.log(N) / Math.log(M));

            // target number of root entries to maximize storage utilization
            M = Math.ceil(N / Math.pow(M, height - 1));
        }

        node = createNode([]);
        node.leaf = false;
        node.height = height;

        // split the items into M mostly square tiles

        const N2 = Math.ceil(N / M);
        const N1 = N2 * Math.ceil(Math.sqrt(M));

        multiSelect(items, left, right, N1, this.compareMinX);

        for (let i = left; i <= right; i += N1) {

            const right2 = Math.min(i + N1 - 1, right);

            multiSelect(items, i, right2, N2, this.compareMinY);

            for (let j = i; j <= right2; j += N2) {

                const right3 = Math.min(j + N2 - 1, right2);

                // pack each entry recursively
                node.children.push(this._build(items, j, right3, height - 1));
            }
        }

        calcBBox(node, this.toBBox);

        return node;
    }

    _chooseSubtree(bbox, node, level, path) {
        while (true) {
            path.push(node);

            if (node.leaf || path.length - 1 === level) break;

            let minArea = Infinity;
            let minEnlargement = Infinity;
            let targetNode;

            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const area = bboxArea(child);
                const enlargement = enlargedArea(bbox, child) - area;

                // choose entry with the least area enlargement
                if (enlargement < minEnlargement) {
                    minEnlargement = enlargement;
                    minArea = area < minArea ? area : minArea;
                    targetNode = child;

                } else if (enlargement === minEnlargement) {
                    // otherwise choose one with the smallest area
                    if (area < minArea) {
                        minArea = area;
                        targetNode = child;
                    }
                }
            }

            node = targetNode || node.children[0];
        }

        return node;
    }

    _insert(item, level, isNode) {
        const bbox = isNode ? item : this.toBBox(item);
        const insertPath = [];

        // find the best node for accommodating the item, saving all nodes along the path too
        const node = this._chooseSubtree(bbox, this.data, level, insertPath);

        // put the item into the node
        node.children.push(item);
        extend$1(node, bbox);

        // split on node overflow; propagate upwards if necessary
        while (level >= 0) {
            if (insertPath[level].children.length > this._maxEntries) {
                this._split(insertPath, level);
                level--;
            } else break;
        }

        // adjust bboxes along the insertion path
        this._adjustParentBBoxes(bbox, insertPath, level);
    }

    // split overflowed node into two
    _split(insertPath, level) {
        const node = insertPath[level];
        const M = node.children.length;
        const m = this._minEntries;

        this._chooseSplitAxis(node, m, M);

        const splitIndex = this._chooseSplitIndex(node, m, M);

        const newNode = createNode(node.children.splice(splitIndex, node.children.length - splitIndex));
        newNode.height = node.height;
        newNode.leaf = node.leaf;

        calcBBox(node, this.toBBox);
        calcBBox(newNode, this.toBBox);

        if (level) insertPath[level - 1].children.push(newNode);
        else this._splitRoot(node, newNode);
    }

    _splitRoot(node, newNode) {
        // split root node
        this.data = createNode([node, newNode]);
        this.data.height = node.height + 1;
        this.data.leaf = false;
        calcBBox(this.data, this.toBBox);
    }

    _chooseSplitIndex(node, m, M) {
        let index;
        let minOverlap = Infinity;
        let minArea = Infinity;

        for (let i = m; i <= M - m; i++) {
            const bbox1 = distBBox(node, 0, i, this.toBBox);
            const bbox2 = distBBox(node, i, M, this.toBBox);

            const overlap = intersectionArea(bbox1, bbox2);
            const area = bboxArea(bbox1) + bboxArea(bbox2);

            // choose distribution with minimum overlap
            if (overlap < minOverlap) {
                minOverlap = overlap;
                index = i;

                minArea = area < minArea ? area : minArea;

            } else if (overlap === minOverlap) {
                // otherwise choose distribution with minimum area
                if (area < minArea) {
                    minArea = area;
                    index = i;
                }
            }
        }

        return index || M - m;
    }

    // sorts node children by the best axis for split
    _chooseSplitAxis(node, m, M) {
        const compareMinX = node.leaf ? this.compareMinX : compareNodeMinX;
        const compareMinY = node.leaf ? this.compareMinY : compareNodeMinY;
        const xMargin = this._allDistMargin(node, m, M, compareMinX);
        const yMargin = this._allDistMargin(node, m, M, compareMinY);

        // if total distributions margin value is minimal for x, sort by minX,
        // otherwise it's already sorted by minY
        if (xMargin < yMargin) node.children.sort(compareMinX);
    }

    // total margin of all possible split distributions where each node is at least m full
    _allDistMargin(node, m, M, compare) {
        node.children.sort(compare);

        const toBBox = this.toBBox;
        const leftBBox = distBBox(node, 0, m, toBBox);
        const rightBBox = distBBox(node, M - m, M, toBBox);
        let margin = bboxMargin(leftBBox) + bboxMargin(rightBBox);

        for (let i = m; i < M - m; i++) {
            const child = node.children[i];
            extend$1(leftBBox, node.leaf ? toBBox(child) : child);
            margin += bboxMargin(leftBBox);
        }

        for (let i = M - m - 1; i >= m; i--) {
            const child = node.children[i];
            extend$1(rightBBox, node.leaf ? toBBox(child) : child);
            margin += bboxMargin(rightBBox);
        }

        return margin;
    }

    _adjustParentBBoxes(bbox, path, level) {
        // adjust bboxes along the given tree path
        for (let i = level; i >= 0; i--) {
            extend$1(path[i], bbox);
        }
    }

    _condense(path) {
        // go through the path, removing empty nodes and updating bboxes
        for (let i = path.length - 1, siblings; i >= 0; i--) {
            if (path[i].children.length === 0) {
                if (i > 0) {
                    siblings = path[i - 1].children;
                    siblings.splice(siblings.indexOf(path[i]), 1);

                } else this.clear();

            } else calcBBox(path[i], this.toBBox);
        }
    }
}

function findItem(item, items, equalsFn) {
    if (!equalsFn) return items.indexOf(item);

    for (let i = 0; i < items.length; i++) {
        if (equalsFn(item, items[i])) return i;
    }
    return -1;
}

// calculate node's bbox from bboxes of its children
function calcBBox(node, toBBox) {
    distBBox(node, 0, node.children.length, toBBox, node);
}

// min bounding rectangle of node children from k to p-1
function distBBox(node, k, p, toBBox, destNode) {
    if (!destNode) destNode = createNode(null);
    destNode.minX = Infinity;
    destNode.minY = Infinity;
    destNode.maxX = -Infinity;
    destNode.maxY = -Infinity;

    for (let i = k; i < p; i++) {
        const child = node.children[i];
        extend$1(destNode, node.leaf ? toBBox(child) : child);
    }

    return destNode;
}

function extend$1(a, b) {
    a.minX = Math.min(a.minX, b.minX);
    a.minY = Math.min(a.minY, b.minY);
    a.maxX = Math.max(a.maxX, b.maxX);
    a.maxY = Math.max(a.maxY, b.maxY);
    return a;
}

function compareNodeMinX(a, b) { return a.minX - b.minX; }
function compareNodeMinY(a, b) { return a.minY - b.minY; }

function bboxArea(a)   { return (a.maxX - a.minX) * (a.maxY - a.minY); }
function bboxMargin(a) { return (a.maxX - a.minX) + (a.maxY - a.minY); }

function enlargedArea(a, b) {
    return (Math.max(b.maxX, a.maxX) - Math.min(b.minX, a.minX)) *
           (Math.max(b.maxY, a.maxY) - Math.min(b.minY, a.minY));
}

function intersectionArea(a, b) {
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);

    return Math.max(0, maxX - minX) *
           Math.max(0, maxY - minY);
}

function contains(a, b) {
    return a.minX <= b.minX &&
           a.minY <= b.minY &&
           b.maxX <= a.maxX &&
           b.maxY <= a.maxY;
}

function intersects$1(a, b) {
    return b.minX <= a.maxX &&
           b.minY <= a.maxY &&
           b.maxX >= a.minX &&
           b.maxY >= a.minY;
}

function createNode(children) {
    return {
        children,
        height: 1,
        leaf: true,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
}

// sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
// combines selection algorithm with binary divide & conquer approach

function multiSelect(arr, left, right, n, compare) {
    const stack = [left, right];

    while (stack.length) {
        right = stack.pop();
        left = stack.pop();

        if (right - left <= n) continue;

        const mid = left + Math.ceil((right - left) / n / 2) * n;
        quickselect(arr, mid, left, right, compare);

        stack.push(left, mid, mid, right);
    }
}

function initBufferConstructors(styles) {
  const layerSerializers = styles
    .reduce((d, s) => (d[s.id] = initLayerSerializer(s), d), {});

  return function(layers, tileCoords, atlas) {
    const tree = new RBush();

    return Object.entries(layers)
      .reverse() // Reverse order for collision checks
      .map(([id, layer]) => {
        let serialize = layerSerializers[id];
        if (serialize) return serialize(layer, tileCoords, atlas, tree);
      })
      .reverse()
      .reduce((d, l) => Object.assign(d, l), {});
  };
}

function initLayerSerializer(style) {
  const { id, interactive } = style;

  const transform = initSerializer(style);

  if (!transform) return;

  return function(layer, tileCoords, atlas, tree) {
    let { type, extent, features } = layer;

    let transformed = features.map(feature => {
      let { properties, geometry } = feature;
      let buffers = transform(feature, tileCoords, atlas, tree);
      // NOTE: if no buffers, we don't even want to keep the original
      // feature--because it won't be visible to the user (not rendered)
      if (buffers) return { properties, geometry, buffers };
    }).filter(f => f !== undefined);

    if (!transformed.length) return;

    const newLayer = { type, extent, buffers: concatBuffers(transformed) };

    if (interactive) newLayer.features = transformed
      .map(({ properties, geometry }) => ({ properties, geometry }));

    return { [id]: newLayer };
  };
}

function initSourceProcessor({ styles, glyphEndpoint }) {
  const parsedStyles = styles.map(getStyleFuncs);

  const sourceFilter = initSourceFilter(parsedStyles);
  const getAtlas = initAtlasGetter({ parsedStyles, glyphEndpoint });
  const process = initBufferConstructors(parsedStyles);

  return function(source, tileCoords) {
    const rawLayers = sourceFilter(source, tileCoords.z);

    return getAtlas(rawLayers, tileCoords.z).then(atlas => {
      const layers = process(rawLayers, tileCoords, atlas);

      // Note: atlas.data.buffer is a Transferable
      return { atlas: atlas.image, layers };
    });
  };
}

function classifyRings(rings) {
  // Classifies an array of rings into polygons with outer rings and holes
  if (rings.length <= 1) return [rings];

  var polygons = [];
  var polygon, ccw;

  rings.forEach(ring => {
    let area = signedArea$1(ring);
    if (area === 0) return;

    if (ccw === undefined) ccw = area < 0;

    if (ccw === area < 0) {
      if (polygon) polygons.push(polygon);
      polygon = [ring];

    } else {
      polygon.push(ring);
    }
  });
  if (polygon) polygons.push(polygon);

  return polygons;
}

function signedArea$1(ring) {
  const xmul = (p1, p2) => (p2.x - p1.x) * (p1.y + p2.y);

  const initialValue = xmul(ring[0], ring[ring.length - 1]);

  return ring.slice(1)  // NOTE: skips ring[0], shifts index
    .reduce( (sum, p1, i) => sum + xmul(p1, ring[i]), initialValue );
}

function VectorTileFeature(pbf, end, extent, keys, values) {
  // Public
  this.properties = {};
  this.extent = extent;
  this.type = 0;

  // Private
  this._pbf = pbf;
  this._geometry = -1;
  this._keys = keys;
  this._values = values;

  pbf.readFields(readFeature, this, end);
}

function readFeature(tag, feature, pbf) {
  if (tag == 1) feature.id = pbf.readVarint();
  else if (tag == 2) readTag(pbf, feature);
  else if (tag == 3) feature.type = pbf.readVarint();
  else if (tag == 4) feature._geometry = pbf.pos;
}

function readTag(pbf, feature) {
  var end = pbf.readVarint() + pbf.pos;

  while (pbf.pos < end) {
    var key = feature._keys[pbf.readVarint()],
      value = feature._values[pbf.readVarint()];
    feature.properties[key] = value;
  }
}

VectorTileFeature.types = ['Unknown', 'Point', 'LineString', 'Polygon'];

VectorTileFeature.prototype.loadGeometry = function() {
  var pbf = this._pbf;
  pbf.pos = this._geometry;

  var end = pbf.readVarint() + pbf.pos,
    cmd = 1,
    length = 0,
    x = 0,
    y = 0,
    lines = [],
    line;

  while (pbf.pos < end) {
    if (length <= 0) {
      var cmdLen = pbf.readVarint();
      cmd = cmdLen & 0x7;
      length = cmdLen >> 3;
    }

    length--;

    if (cmd === 1 || cmd === 2) {
      x += pbf.readSVarint();
      y += pbf.readSVarint();

      if (cmd === 1) { // moveTo
        if (line) lines.push(line);
        line = [];
      }

      line.push({ x, y });

    } else if (cmd === 7) {
      // Workaround for https://github.com/mapbox/mapnik-vector-tile/issues/90
      if (line) line.push({ // closePolygon
        x: line[0].x,
        y: line[0].y
      });

    } else {
      throw new Error('unknown command ' + cmd);
    }
  }

  if (line) lines.push(line);

  return lines;
};

VectorTileFeature.prototype.bbox = function() {
  var pbf = this._pbf;
  pbf.pos = this._geometry;

  var end = pbf.readVarint() + pbf.pos,
  cmd = 1,
  length = 0,
  x = 0,
  y = 0,
  x1 = Infinity,
  x2 = -Infinity,
  y1 = Infinity,
  y2 = -Infinity;

  while (pbf.pos < end) {
    if (length <= 0) {
      var cmdLen = pbf.readVarint();
      cmd = cmdLen & 0x7;
      length = cmdLen >> 3;
    }

    length--;

    if (cmd === 1 || cmd === 2) {
      x += pbf.readSVarint();
      y += pbf.readSVarint();
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;

    } else if (cmd !== 7) {
      throw new Error('unknown command ' + cmd);
    }
  }

  return [x1, y1, x2, y2];
};

VectorTileFeature.prototype.toGeoJSON = function(size, sx = 0, sy = 0) {
  // Input size is the side length of the (square) area over which the
  //  coordinate space of this tile [0, this.extent] will be rendered.
  // Input sx, sy is the origin (top left corner) of the output coordinates
  //  within the (size x size) rendered area of the full tile.

  size = size || this.extent;
  var scale = size / this.extent,
    coords = this.loadGeometry(),
    type = VectorTileFeature.types[this.type];

  function project(line) {
    return line.map(p => [p.x * scale - sx, p.y * scale - sy]);
  }

  switch (type) {
    case "Point":
      coords = project( coords.map(p => p[0]) );
      break;

    case "LineString":
      coords = coords.map(project);
      break;

    case "Polygon":
      coords = classifyRings(coords);
      coords = coords.map(polygon => polygon.map(project));
      break;
  }

  if (coords.length === 1) {
    coords = coords[0];
  } else {
    type = 'Multi' + type;
  }

  var result = {
    type: "Feature",
    geometry: {
      type: type,
      coordinates: coords
    },
    properties: this.properties
  };

  if ('id' in this) result.id = this.id;

  return result;
};

function VectorTileLayer(pbf, end) {
  // Public
  this.version = 1;
  this.name = null;
  this.extent = 4096;
  this.length = 0;

  // Private
  this._pbf = pbf;
  this._keys = [];
  this._values = [];
  this._features = [];

  pbf.readFields(readLayer, this, end);

  this.length = this._features.length;
}

function readLayer(tag, layer, pbf) {
  if (tag === 15) layer.version = pbf.readVarint();
  else if (tag === 1) layer.name = pbf.readString();
  else if (tag === 5) layer.extent = pbf.readVarint();
  else if (tag === 2) layer._features.push(pbf.pos);
  else if (tag === 3) layer._keys.push(pbf.readString());
  else if (tag === 4) layer._values.push(readValueMessage(pbf));
}

function readValueMessage(pbf) {
  var value = null,
  end = pbf.readVarint() + pbf.pos;

  while (pbf.pos < end) {
    var tag = pbf.readVarint() >> 3;

    value = tag === 1 ? pbf.readString() :
      tag === 2 ? pbf.readFloat() :
      tag === 3 ? pbf.readDouble() :
      tag === 4 ? pbf.readVarint64() :
      tag === 5 ? pbf.readVarint() :
      tag === 6 ? pbf.readSVarint() :
      tag === 7 ? pbf.readBoolean() : null;
  }

  return value;
}

// return feature 'i' from this layer as a 'VectorTileFeature'
VectorTileLayer.prototype.feature = function(i) {
  if (i < 0 || i >= this._features.length) throw new Error('feature index out of bounds');

  this._pbf.pos = this._features[i];

  var end = this._pbf.readVarint() + this._pbf.pos;
  return new VectorTileFeature(this._pbf, end, this.extent, this._keys, this._values);
};

VectorTileLayer.prototype.toGeoJSON = function(size, sx, sy) {
  const features = Array.from(Array(this._features.length), (v, i) => {
    return this.feature(i).toGeoJSON(size, sx, sy);
  });

  return { type: "FeatureCollection", features, extent: this.extent };
};

function VectorTile(pbf, end) {
  this.layers = pbf.readFields(readTile, {}, end);
}

function readTile(tag, layers, pbf) {
  if (tag === 3) {
    var layer = new VectorTileLayer(pbf, pbf.readVarint() + pbf.pos);
    if (layer.length) layers[layer.name] = layer;
  }
}

function initMVT(source) {
  const getURL = initUrlFunc(source.tiles);

  // TODO: use VectorTile.extent. Requires changes in vector-tile-esm, tile-painter
  const size = 512;

  return function(tileCoords, callback) {
    const { z, x, y } = tileCoords;
    const dataHref = getURL(z, x, y);

    return xhrGet(dataHref, "arraybuffer", parseMVT);

    function parseMVT(err, data) {
      if (err) return callback(err, data);
      const tile = new VectorTile(new pbf(data));
      const json = Object.values(tile.layers)
        .reduce((d, l) => (d[l.name] = l.toGeoJSON(size), d), {});
      callback(null, json);
    }
  };
}

function xhrGet(href, type, callback) {
  var req = new XMLHttpRequest();
  req.responseType = type;

  req.onerror = errHandler;
  req.onabort = errHandler;
  req.onload = loadHandler;

  req.open('get', href);
  req.send();

  function errHandler(e) {
    let err = "XMLHttpRequest ended with an " + e.type;
    return callback(err);
  }
  function loadHandler(e) {
    if (req.responseType !== type) {
      let err = "XMLHttpRequest: Wrong responseType. Expected " +
        type + ", got " + req.responseType;
      return callback(err, req.response);
    }
    if (req.status !== 200) {
      let err = "XMLHttpRequest: HTTP " + req.status + " error from " + href;
      return callback(err, req.response);
    }
    return callback(null, req.response);
  }

  return req; // Request can be aborted via req.abort()
}

function initUrlFunc(endpoints) {
  // Use a different endpoint for each request
  var index = 0;

  return function(z, x, y) {
    index = (index + 1) % endpoints.length;
    var endpoint = endpoints[index];
    return endpoint.replace(/{z}/, z).replace(/{x}/, x).replace(/{y}/, y);
  };
}

// calculate simplification data using optimized Douglas-Peucker algorithm

function simplify(coords, first, last, sqTolerance) {
    var maxSqDist = sqTolerance;
    var mid = (last - first) >> 1;
    var minPosToMid = last - first;
    var index;

    var ax = coords[first];
    var ay = coords[first + 1];
    var bx = coords[last];
    var by = coords[last + 1];

    for (var i = first + 3; i < last; i += 3) {
        var d = getSqSegDist(coords[i], coords[i + 1], ax, ay, bx, by);

        if (d > maxSqDist) {
            index = i;
            maxSqDist = d;

        } else if (d === maxSqDist) {
            // a workaround to ensure we choose a pivot close to the middle of the list,
            // reducing recursion depth, for certain degenerate inputs
            // https://github.com/mapbox/geojson-vt/issues/104
            var posToMid = Math.abs(i - mid);
            if (posToMid < minPosToMid) {
                index = i;
                minPosToMid = posToMid;
            }
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 3) simplify(coords, first, index, sqTolerance);
        coords[index + 2] = maxSqDist;
        if (last - index > 3) simplify(coords, index, last, sqTolerance);
    }
}

// square distance from a point to a segment
function getSqSegDist(px, py, x, y, bx, by) {

    var dx = bx - x;
    var dy = by - y;

    if (dx !== 0 || dy !== 0) {

        var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = bx;
            y = by;

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = px - x;
    dy = py - y;

    return dx * dx + dy * dy;
}

function createFeature(id, type, geom, tags) {
    var feature = {
        id: typeof id === 'undefined' ? null : id,
        type: type,
        geometry: geom,
        tags: tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
    calcBBox$1(feature);
    return feature;
}

function calcBBox$1(feature) {
    var geom = feature.geometry;
    var type = feature.type;

    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
        calcLineBBox(feature, geom);

    } else if (type === 'Polygon' || type === 'MultiLineString') {
        for (var i = 0; i < geom.length; i++) {
            calcLineBBox(feature, geom[i]);
        }

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < geom.length; i++) {
            for (var j = 0; j < geom[i].length; j++) {
                calcLineBBox(feature, geom[i][j]);
            }
        }
    }
}

function calcLineBBox(feature, geom) {
    for (var i = 0; i < geom.length; i += 3) {
        feature.minX = Math.min(feature.minX, geom[i]);
        feature.minY = Math.min(feature.minY, geom[i + 1]);
        feature.maxX = Math.max(feature.maxX, geom[i]);
        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
    }
}

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

function convert(data, options) {
    var features = [];
    if (data.type === 'FeatureCollection') {
        for (var i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], options, i);
        }

    } else if (data.type === 'Feature') {
        convertFeature(features, data, options);

    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, options);
    }

    return features;
}

function convertFeature(features, geojson, options, index) {
    if (!geojson.geometry) return;

    var coords = geojson.geometry.coordinates;
    var type = geojson.geometry.type;
    var tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    var geometry = [];
    var id = geojson.id;
    if (options.promoteId) {
        id = geojson.properties[options.promoteId];
    } else if (options.generateId) {
        id = index || 0;
    }
    if (type === 'Point') {
        convertPoint(coords, geometry);

    } else if (type === 'MultiPoint') {
        for (var i = 0; i < coords.length; i++) {
            convertPoint(coords[i], geometry);
        }

    } else if (type === 'LineString') {
        convertLine(coords, geometry, tolerance, false);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into linestrings to be able to track metrics
            for (i = 0; i < coords.length; i++) {
                geometry = [];
                convertLine(coords[i], geometry, tolerance, false);
                features.push(createFeature(id, 'LineString', geometry, geojson.properties));
            }
            return;
        } else {
            convertLines(coords, geometry, tolerance, false);
        }

    } else if (type === 'Polygon') {
        convertLines(coords, geometry, tolerance, true);

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < coords.length; i++) {
            var polygon = [];
            convertLines(coords[i], polygon, tolerance, true);
            geometry.push(polygon);
        }
    } else if (type === 'GeometryCollection') {
        for (i = 0; i < geojson.geometry.geometries.length; i++) {
            convertFeature(features, {
                id: id,
                geometry: geojson.geometry.geometries[i],
                properties: geojson.properties
            }, options, index);
        }
        return;
    } else {
        throw new Error('Input data is not a valid GeoJSON object.');
    }

    features.push(createFeature(id, type, geometry, geojson.properties));
}

function convertPoint(coords, out) {
    out.push(projectX(coords[0]));
    out.push(projectY(coords[1]));
    out.push(0);
}

function convertLine(ring, out, tolerance, isPolygon) {
    var x0, y0;
    var size = 0;

    for (var j = 0; j < ring.length; j++) {
        var x = projectX(ring[j][0]);
        var y = projectY(ring[j][1]);

        out.push(x);
        out.push(y);
        out.push(0);

        if (j > 0) {
            if (isPolygon) {
                size += (x0 * y - x * y0) / 2; // area
            } else {
                size += Math.sqrt(Math.pow(x - x0, 2) + Math.pow(y - y0, 2)); // length
            }
        }
        x0 = x;
        y0 = y;
    }

    var last = out.length - 3;
    out[2] = 1;
    simplify(out, 0, last, tolerance);
    out[last + 2] = 1;

    out.size = Math.abs(size);
    out.start = 0;
    out.end = out.size;
}

function convertLines(rings, out, tolerance, isPolygon) {
    for (var i = 0; i < rings.length; i++) {
        var geom = [];
        convertLine(rings[i], geom, tolerance, isPolygon);
        out.push(geom);
    }
}

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    var sin = Math.sin(y * Math.PI / 180);
    var y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, scale, k1, k2, axis, minAll, maxAll, options) {

    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    else if (maxAll < k1 || minAll >= k2) return null; // trivial reject

    var clipped = [];

    for (var i = 0; i < features.length; i++) {

        var feature = features[i];
        var geometry = feature.geometry;
        var type = feature.type;

        var min = axis === 0 ? feature.minX : feature.minY;
        var max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max < k2) { // trivial accept
            clipped.push(feature);
            continue;
        } else if (max < k1 || min >= k2) { // trivial reject
            continue;
        }

        var newGeometry = [];

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(geometry, newGeometry, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(geometry, newGeometry, k1, k2, axis, false, options.lineMetrics);

        } else if (type === 'MultiLineString') {
            clipLines(geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(geometry, newGeometry, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (var j = 0; j < geometry.length; j++) {
                var polygon = [];
                clipLines(geometry[j], polygon, k1, k2, axis, true);
                if (polygon.length) {
                    newGeometry.push(polygon);
                }
            }
        }

        if (newGeometry.length) {
            if (options.lineMetrics && type === 'LineString') {
                for (j = 0; j < newGeometry.length; j++) {
                    clipped.push(createFeature(feature.id, type, newGeometry[j], feature.tags));
                }
                continue;
            }

            if (type === 'LineString' || type === 'MultiLineString') {
                if (newGeometry.length === 1) {
                    type = 'LineString';
                    newGeometry = newGeometry[0];
                } else {
                    type = 'MultiLineString';
                }
            }
            if (type === 'Point' || type === 'MultiPoint') {
                type = newGeometry.length === 3 ? 'Point' : 'MultiPoint';
            }

            clipped.push(createFeature(feature.id, type, newGeometry, feature.tags));
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geom, newGeom, k1, k2, axis) {
    for (var i = 0; i < geom.length; i += 3) {
        var a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            newGeom.push(geom[i]);
            newGeom.push(geom[i + 1]);
            newGeom.push(geom[i + 2]);
        }
    }
}

function clipLine(geom, newGeom, k1, k2, axis, isPolygon, trackMetrics) {

    var slice = newSlice(geom);
    var intersect = axis === 0 ? intersectX : intersectY;
    var len = geom.start;
    var segLen, t;

    for (var i = 0; i < geom.length - 3; i += 3) {
        var ax = geom[i];
        var ay = geom[i + 1];
        var az = geom[i + 2];
        var bx = geom[i + 3];
        var by = geom[i + 4];
        var a = axis === 0 ? ax : ay;
        var b = axis === 0 ? bx : by;
        var exited = false;

        if (trackMetrics) segLen = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));

        if (a < k1) {
            // ---|-->  | (line enters the clip region from the left)
            if (b > k1) {
                t = intersect(slice, ax, ay, bx, by, k1);
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b < k2) {
                t = intersect(slice, ax, ay, bx, by, k2);
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else {
            addPoint(slice, ax, ay, az);
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(slice, ax, ay, bx, by, k1);
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(slice, ax, ay, bx, by, k2);
            exited = true;
        }

        if (!isPolygon && exited) {
            if (trackMetrics) slice.end = len + segLen * t;
            newGeom.push(slice);
            slice = newSlice(geom);
        }

        if (trackMetrics) len += segLen;
    }

    // add the last point
    var last = geom.length - 3;
    ax = geom[last];
    ay = geom[last + 1];
    az = geom[last + 2];
    a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) addPoint(slice, ax, ay, az);

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - 3;
    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
        addPoint(slice, slice[0], slice[1], slice[2]);
    }

    // add the final slice
    if (slice.length) {
        newGeom.push(slice);
    }
}

function newSlice(line) {
    var slice = [];
    slice.size = line.size;
    slice.start = line.start;
    slice.end = line.end;
    return slice;
}

function clipLines(geom, newGeom, k1, k2, axis, isPolygon) {
    for (var i = 0; i < geom.length; i++) {
        clipLine(geom[i], newGeom, k1, k2, axis, isPolygon, false);
    }
}

function addPoint(out, x, y, z) {
    out.push(x);
    out.push(y);
    out.push(z);
}

function intersectX(out, ax, ay, bx, by, x) {
    var t = (x - ax) / (bx - ax);
    out.push(x);
    out.push(ay + (by - ay) * t);
    out.push(1);
    return t;
}

function intersectY(out, ax, ay, bx, by, y) {
    var t = (y - ay) / (by - ay);
    out.push(ax + (bx - ax) * t);
    out.push(y);
    out.push(1);
    return t;
}

function wrap(features, options) {
    var buffer = options.buffer / options.extent;
    var merged = features;
    var left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2, options); // left world copy
    var right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2, options); // right world copy

    if (left || right) {
        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2, options) || []; // center world copy

        if (left) merged = shiftFeatureCoords(left, 1).concat(merged); // merge left into center
        if (right) merged = merged.concat(shiftFeatureCoords(right, -1)); // merge right into center
    }

    return merged;
}

function shiftFeatureCoords(features, offset) {
    var newFeatures = [];

    for (var i = 0; i < features.length; i++) {
        var feature = features[i],
            type = feature.type;

        var newGeometry;

        if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
            newGeometry = shiftCoords(feature.geometry, offset);

        } else if (type === 'MultiLineString' || type === 'Polygon') {
            newGeometry = [];
            for (var j = 0; j < feature.geometry.length; j++) {
                newGeometry.push(shiftCoords(feature.geometry[j], offset));
            }
        } else if (type === 'MultiPolygon') {
            newGeometry = [];
            for (j = 0; j < feature.geometry.length; j++) {
                var newPolygon = [];
                for (var k = 0; k < feature.geometry[j].length; k++) {
                    newPolygon.push(shiftCoords(feature.geometry[j][k], offset));
                }
                newGeometry.push(newPolygon);
            }
        }

        newFeatures.push(createFeature(feature.id, type, newGeometry, feature.tags));
    }

    return newFeatures;
}

function shiftCoords(points, offset) {
    var newPoints = [];
    newPoints.size = points.size;

    if (points.start !== undefined) {
        newPoints.start = points.start;
        newPoints.end = points.end;
    }

    for (var i = 0; i < points.length; i += 3) {
        newPoints.push(points[i] + offset, points[i + 1], points[i + 2]);
    }
    return newPoints;
}

// Transforms the coordinates of each feature in the given tile from
// mercator-projected space into (extent x extent) tile space.
function transformTile(tile, extent) {
    if (tile.transformed) return tile;

    var z2 = 1 << tile.z,
        tx = tile.x,
        ty = tile.y,
        i, j, k;

    for (i = 0; i < tile.features.length; i++) {
        var feature = tile.features[i],
            geom = feature.geometry,
            type = feature.type;

        feature.geometry = [];

        if (type === 1) {
            for (j = 0; j < geom.length; j += 2) {
                feature.geometry.push(transformPoint(geom[j], geom[j + 1], extent, z2, tx, ty));
            }
        } else {
            for (j = 0; j < geom.length; j++) {
                var ring = [];
                for (k = 0; k < geom[j].length; k += 2) {
                    ring.push(transformPoint(geom[j][k], geom[j][k + 1], extent, z2, tx, ty));
                }
                feature.geometry.push(ring);
            }
        }
    }

    tile.transformed = true;

    return tile;
}

function transformPoint(x, y, extent, z2, tx, ty) {
    return [
        Math.round(extent * (x * z2 - tx)),
        Math.round(extent * (y * z2 - ty))];
}

function createTile(features, z, tx, ty, options) {
    var tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    var tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: 0,
        source: null,
        x: tx,
        y: ty,
        z: z,
        transformed: false,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (var i = 0; i < features.length; i++) {
        tile.numFeatures++;
        addFeature(tile, features[i], tolerance, options);

        var minX = features[i].minX;
        var minY = features[i].minY;
        var maxX = features[i].maxX;
        var maxY = features[i].maxY;

        if (minX < tile.minX) tile.minX = minX;
        if (minY < tile.minY) tile.minY = minY;
        if (maxX > tile.maxX) tile.maxX = maxX;
        if (maxY > tile.maxY) tile.maxY = maxY;
    }
    return tile;
}

function addFeature(tile, feature, tolerance, options) {

    var geom = feature.geometry,
        type = feature.type,
        simplified = [];

    if (type === 'Point' || type === 'MultiPoint') {
        for (var i = 0; i < geom.length; i += 3) {
            simplified.push(geom[i]);
            simplified.push(geom[i + 1]);
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(simplified, geom, tile, tolerance, false, false);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (i = 0; i < geom.length; i++) {
            addLine(simplified, geom[i], tile, tolerance, type === 'Polygon', i === 0);
        }

    } else if (type === 'MultiPolygon') {

        for (var k = 0; k < geom.length; k++) {
            var polygon = geom[k];
            for (i = 0; i < polygon.length; i++) {
                addLine(simplified, polygon[i], tile, tolerance, true, i === 0);
            }
        }
    }

    if (simplified.length) {
        var tags = feature.tags || null;
        if (type === 'LineString' && options.lineMetrics) {
            tags = {};
            for (var key in feature.tags) tags[key] = feature.tags[key];
            tags['mapbox_clip_start'] = geom.start / geom.size;
            tags['mapbox_clip_end'] = geom.end / geom.size;
        }
        var tileFeature = {
            geometry: simplified,
            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
                type === 'LineString' || type === 'MultiLineString' ? 2 : 1,
            tags: tags
        };
        if (feature.id !== null) {
            tileFeature.id = feature.id;
        }
        tile.features.push(tileFeature);
    }
}

function addLine(result, geom, tile, tolerance, isPolygon, isOuter) {
    var sqTolerance = tolerance * tolerance;

    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / 3;
        return;
    }

    var ring = [];

    for (var i = 0; i < geom.length; i += 3) {
        if (tolerance === 0 || geom[i + 2] > sqTolerance) {
            tile.numSimplified++;
            ring.push(geom[i]);
            ring.push(geom[i + 1]);
        }
        tile.numPoints++;
    }

    if (isPolygon) rewind(ring, isOuter);

    result.push(ring);
}

function rewind(ring, clockwise) {
    var area = 0;
    for (var i = 0, len = ring.length, j = len - 2; i < len; j = i, i += 2) {
        area += (ring[i] - ring[j]) * (ring[i + 1] + ring[j + 1]);
    }
    if (area > 0 === clockwise) {
        for (i = 0, len = ring.length; i < len / 2; i += 2) {
            var x = ring[i];
            var y = ring[i + 1];
            ring[i] = ring[len - 2 - i];
            ring[i + 1] = ring[len - 1 - i];
            ring[len - 2 - i] = x;
            ring[len - 1 - i] = y;
        }
    }
}

function geojsonvt(data, options) {
    return new GeoJSONVT(data, options);
}

function GeoJSONVT(data, options) {
    options = this.options = extend$2(Object.create(this.options), options);

    var debug = options.debug;

    if (debug) console.time('preprocess data');

    if (options.maxZoom < 0 || options.maxZoom > 24) throw new Error('maxZoom should be in the 0-24 range');
    if (options.promoteId && options.generateId) throw new Error('promoteId and generateId cannot be used together.');

    var features = convert(data, options);

    this.tiles = {};
    this.tileCoords = [];

    if (debug) {
        console.timeEnd('preprocess data');
        console.log('index: maxZoom: %d, maxPoints: %d', options.indexMaxZoom, options.indexMaxPoints);
        console.time('generate tiles');
        this.stats = {};
        this.total = 0;
    }

    features = wrap(features, options);

    // start slicing from the top tile down
    if (features.length) this.splitTile(features, 0, 0, 0);

    if (debug) {
        if (features.length) console.log('features: %d, points: %d', this.tiles[0].numFeatures, this.tiles[0].numPoints);
        console.timeEnd('generate tiles');
        console.log('tiles generated:', this.total, JSON.stringify(this.stats));
    }
}

GeoJSONVT.prototype.options = {
    maxZoom: 14,            // max zoom to preserve detail on
    indexMaxZoom: 5,        // max zoom in the tile index
    indexMaxPoints: 100000, // max number of points per tile in the tile index
    tolerance: 3,           // simplification tolerance (higher means simpler)
    extent: 4096,           // tile extent
    buffer: 64,             // tile buffer on each side
    lineMetrics: false,     // whether to calculate line metrics
    promoteId: null,        // name of a feature property to be promoted to feature.id
    generateId: false,      // whether to generate feature ids. Cannot be used with promoteId
    debug: 0                // logging level (0, 1 or 2)
};

GeoJSONVT.prototype.splitTile = function (features, z, x, y, cz, cx, cy) {

    var stack = [features, z, x, y],
        options = this.options,
        debug = options.debug;

    // avoid recursion by using a processing queue
    while (stack.length) {
        y = stack.pop();
        x = stack.pop();
        z = stack.pop();
        features = stack.pop();

        var z2 = 1 << z,
            id = toID(z, x, y),
            tile = this.tiles[id];

        if (!tile) {
            if (debug > 1) console.time('creation');

            tile = this.tiles[id] = createTile(features, z, x, y, options);
            this.tileCoords.push({z: z, x: x, y: y});

            if (debug) {
                if (debug > 1) {
                    console.log('tile z%d-%d-%d (features: %d, points: %d, simplified: %d)',
                        z, x, y, tile.numFeatures, tile.numPoints, tile.numSimplified);
                    console.timeEnd('creation');
                }
                var key = 'z' + z;
                this.stats[key] = (this.stats[key] || 0) + 1;
                this.total++;
            }
        }

        // save reference to original geometry in tile so that we can drill down later if we stop now
        tile.source = features;

        // if it's the first-pass tiling
        if (!cz) {
            // stop tiling if we reached max zoom, or if the tile is too simple
            if (z === options.indexMaxZoom || tile.numPoints <= options.indexMaxPoints) continue;

        // if a drilldown to a specific tile
        } else {
            // stop tiling if we reached base zoom or our target tile zoom
            if (z === options.maxZoom || z === cz) continue;

            // stop tiling if it's not an ancestor of the target tile
            var m = 1 << (cz - z);
            if (x !== Math.floor(cx / m) || y !== Math.floor(cy / m)) continue;
        }

        // if we slice further down, no need to keep source geometry
        tile.source = null;

        if (features.length === 0) continue;

        if (debug > 1) console.time('clipping');

        // values we'll use for clipping
        var k1 = 0.5 * options.buffer / options.extent,
            k2 = 0.5 - k1,
            k3 = 0.5 + k1,
            k4 = 1 + k1,
            tl, bl, tr, br, left, right;

        tl = bl = tr = br = null;

        left  = clip(features, z2, x - k1, x + k3, 0, tile.minX, tile.maxX, options);
        right = clip(features, z2, x + k2, x + k4, 0, tile.minX, tile.maxX, options);
        features = null;

        if (left) {
            tl = clip(left, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
            bl = clip(left, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
            left = null;
        }

        if (right) {
            tr = clip(right, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
            br = clip(right, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
            right = null;
        }

        if (debug > 1) console.timeEnd('clipping');

        stack.push(tl || [], z + 1, x * 2,     y * 2);
        stack.push(bl || [], z + 1, x * 2,     y * 2 + 1);
        stack.push(tr || [], z + 1, x * 2 + 1, y * 2);
        stack.push(br || [], z + 1, x * 2 + 1, y * 2 + 1);
    }
};

GeoJSONVT.prototype.getTile = function (z, x, y) {
    var options = this.options,
        extent = options.extent,
        debug = options.debug;

    if (z < 0 || z > 24) return null;

    var z2 = 1 << z;
    x = ((x % z2) + z2) % z2; // wrap tile x coordinate

    var id = toID(z, x, y);
    if (this.tiles[id]) return transformTile(this.tiles[id], extent);

    if (debug > 1) console.log('drilling down to z%d-%d-%d', z, x, y);

    var z0 = z,
        x0 = x,
        y0 = y,
        parent;

    while (!parent && z0 > 0) {
        z0--;
        x0 = Math.floor(x0 / 2);
        y0 = Math.floor(y0 / 2);
        parent = this.tiles[toID(z0, x0, y0)];
    }

    if (!parent || !parent.source) return null;

    // if we found a parent tile containing the original geometry, we can drill down from it
    if (debug > 1) console.log('found parent tile z%d-%d-%d', z0, x0, y0);

    if (debug > 1) console.time('drilling down');
    this.splitTile(parent.source, z0, x0, y0, z, x, y);
    if (debug > 1) console.timeEnd('drilling down');

    return this.tiles[id] ? transformTile(this.tiles[id], extent) : null;
};

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function extend$2(dest, src) {
    for (var i in src) dest[i] = src[i];
    return dest;
}

function initGeojson(source, styles) {
  const extent = 512; // TODO: reset to 4096? Then tolerance can be default 3
  const indexParams = { extent, tolerance: 1 };
  const tileIndex = geojsonvt(source.data, indexParams);

  // TODO: does geojson-vt always return only one layer?
  const layerID = styles[0].id;

  return function(tileCoords, callback) {
    const { z, x, y } = tileCoords;

    const tile = tileIndex.getTile(z, x, y);

    const err = (!tile || !tile.features || !tile.features.length)
      ? "ERROR in GeojsonLoader for tile z, x, y = " + [z, x, y].join(", ")
      : null;

    const layer = { type: "FeatureCollection", extent };
    if (!err) layer.features = tile.features.map(geojsonvtToJSON);

    const json = { [layerID]: layer };
    setTimeout(() => callback(err, json));

    return { abort: () => undefined };
  };
}

function geojsonvtToJSON(value) {
  const { geometry, type: typeNum, tags: properties } = value;
  if (!geometry) return value;

  const types = ['Unknown', 'Point', 'LineString', 'Polygon'];

  const type = (geometry.length <= 1)
    ? types[typeNum]
    : 'Multi' + types[typeNum];

  const coordinates =
    (type == "MultiPolygon") ? [geometry]
    : (type === 'Point'|| type === 'LineString') ? geometry[0]
    : geometry;

  return { geometry: { type, coordinates }, properties };
}

const tasks = {};
var loader, processor;

onmessage = function(msgEvent) {
  const { id, type, payload } = msgEvent.data;

  switch (type) {
    case "setup":
      // NOTE: changing global variable!
      let { styles, glyphEndpoint, source } = payload;
      loader = (source.type === "geojson")
        ? initGeojson(source, styles)
        : initMVT(source);
      processor = initSourceProcessor(payload);
      break;
    case "getTile":
      // let { z, x, y } = payload;
      let callback = (err, result) => process(id, err, result, payload);
      const request = loader(payload, callback);
      tasks[id] = { request, status: "requested" };
      break;
    case "cancel":
      let task = tasks[id];
      if (task && task.status === "requested") task.request.abort();
      delete tasks[id];
      break;
      // Bad message type!
  }
};

function process(id, err, result, tileCoords) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return;  // Task must have been canceled

  if (err) {
    delete tasks[id];
    return postMessage({ id, type: "error", payload: err });
  }

  task.status = "parsing";
  return processor(result, tileCoords).then(tile => sendTile(id, tile));
}

function sendTile(id, tile) {
  // Make sure we still have an active task for this ID
  let task = tasks[id];
  if (!task) return; // Task must have been canceled

  // Get a list of all the Transferable objects
  const transferables = Object.values(tile.layers)
    .flatMap(l => Object.values(l.buffers).map(b => b.buffer));
  transferables.push(tile.atlas.data.buffer);

  postMessage({ id, type: "data", payload: tile }, transferables);
}
`;

function initTileMixer(userParams) {
  const params = setParams$1$1(userParams);
  const { queue, context: { loadBuffers, loadAtlas } } = params;

  // Initialize workers
  const workerPath = URL.createObjectURL( new Blob([workerCode]) );
  const workers = initWorkers(workerPath, params);
  URL.revokeObjectURL(workerPath);

  // Define request function
  function request({ z, x, y, getPriority, callback }) {
    const reqHandle = {};

    const readTaskId = workers.startTask({ z, x, y }, prepData);
    reqHandle.abort = () => workers.cancelTask(readTaskId);

    function prepData(err, source) {
      if (err) return callback(err);

      const chunks = getPrepFuncs(source, callback);
      const prepTaskId = queue.enqueueTask({ getPriority, chunks });

      reqHandle.abort = () => queue.cancelTask(prepTaskId);
    }

    return reqHandle;
  }

  function getPrepFuncs(source, callback) {
    const { atlas, layers } = source;

    const prepTasks = Object.values(layers)
      .map(l => () => { l.buffers = loadBuffers(l.buffers); });

    if (atlas) prepTasks.push(() => { source.atlas = loadAtlas(atlas); });

    prepTasks.push(() => callback(null, source));
    return prepTasks;
  }

  // Return API
  return {
    request,
    activeTasks: () => workers.activeTasks() + queue.countTasks(),
    workerTasks: () => workers.activeTasks(),
    queuedTasks: () => queue.countTasks(),
    terminate: () => workers.terminate(),
  };
}

function initCache({ create, size = 512 }) {
  const tiles = {};
  const dzmax = Math.log2(size);

  function getOrCreateTile(zxy) {
    let id = zxy.join("/");
    if (tiles[id]) return tiles[id];

    let tile = create(...zxy); // TODO: review create signature
    if (tile) tiles[id] = tile;
    return tile;
  }

  return { retrieve, process, drop };

  function retrieve(zxy, condition) {
    let z = zxy[0];
    if (!condition) condition = ([pz]) => (pz < 0 || (z - pz) > dzmax);

    return getTileOrParent(zxy, 0, 0, size, condition);
  }

  function getTileOrParent(
    zxy,        // Coordinates of the requested tile (could be more than 3D)
    sx, sy, sw, // Cropping parameters--which part of the tile to use
    condition   // Stopping criterion for recursion
  ) {
    if (condition(zxy)) return;

    let tile = getOrCreateTile(zxy);
    if (!tile) return; // can't create tile for this zxy
    if (tile.ready) return { tile, sx, sy, sw };

    // Get coordinates of the parent tile
    let [z, x, y] = zxy;
    let pz = z - 1;
    let px = Math.floor(x / 2);
    let py = Math.floor(y / 2);
    let pzxy = [pz, px, py, ...zxy.slice(3)]; // Include extra coords, if any

    // Compute cropping parameters for the parent
    let psx = sx / 2 + (x / 2 - px) * size;
    let psy = sy / 2 + (y / 2 - py) * size;
    let psw = sw / 2;

    return getTileOrParent(pzxy, psx, psy, psw, condition);
  }

  function process(func) {
    Object.values(tiles).forEach( tile => func(tile) );
  }

  function drop(condition) {
    var numTiles = 0;
    for (let id in tiles) {
      if (condition(tiles[id])) {
        tiles[id].cancel();
        delete tiles[id];
      } else {
        numTiles ++;
      }
    }
    return numTiles;
  }
}

function initCaches({ context, glyphs }) {
  const queue = init$2();
  const reporter = document.createElement("div");
  
  function addSource({ source, layers }) {
    const loader = initLoader(source, layers);
    const factory = buildFactory({ loader, reporter });
    return initCache({ create: factory, size: 1.0 });
  }

  function initLoader(source, layers) {
    switch (source.type) {
      case "vector":
      case "geojson":
        return initTileMixer({
          context, queue, glyphs, source, layers,
          threads: (source.type === "geojson") ? 1 : 2,
        });
      case "raster":
        //return initRasterLoader(source, layers);
      default: return;
    }
  }

  return {
    addSource,
    sortTasks: queue.sortTasks,
    queuedTasks: queue.countTasks,
    reporter,
  };
}

function buildFactory({ loader, reporter }) {
  return function(z, x, y) {
    let id = [z, x, y].join("/");
    const tile = { z, x, y, id, priority: 0 };

    function callback(err, data) {
      if (err) return; // console.log(err);
      tile.data = data;
      tile.ready = true;
      reporter.dispatchEvent(new Event("tileLoaded"));
    }

    const getPriority = () => tile.priority;
    const loadTask = loader.request({ z, x, y, getPriority, callback });

    tile.cancel = () => {
      loadTask.abort();
      tile.canceled = true;
    };

    return tile;
  }
}

function initBoundsCheck(source) {
  const {
    minzoom = 0,
    maxzoom = 30,
    bounds = [-180, -90, 180, 90],
    scheme = "xyz",
  } = source;

  // Convert bounds to Web Mercator (the projection ASSUMED by tilejson-spec)
  const radianBounds = bounds.map(c => c * Math.PI / 180.0);
  let [xmin, ymax] = forward(radianBounds.slice(0, 2));
  let [xmax, ymin] = forward(radianBounds.slice(2, 4));
  // TODO: this looks weird? min/max is mathematical, regardless of scheme
  if (scheme === "tms") [ymin, ymax] = [ymax, ymin];

  return function(z, x, y) {
    // Return true if out of bounds
    if (z < minzoom || maxzoom < z) return true;

    let zFac = 1 / 2 ** z;
    if ((x + 1) * zFac < xmin || xmax < x * zFac) return true;
    if ((y + 1) * zFac < ymin || ymax < y * zFac) return true;

    return false;
  }
}

function defaultScale(t) {
  return t.k;
}

function defaultTranslate(t) {
  return [t.x, t.y];
}

function constant(x) {
  return function() {
    return x;
  };
}

function tile() {
  const minZoom = 0;
  let maxZoom = 30;
  let x0 = 0, y0 = 0, x1 = 960, y1 = 500;
  let clampX = true, clampY = true;
  let tileSize = 256;
  let scale = defaultScale;
  let translate = defaultTranslate;
  let zoomDelta = 0;

  function tile() {
    const scale_ = +scale.apply(this, arguments);
    const translate_ = translate.apply(this, arguments);
    const z = Math.log2(scale_ / tileSize);
    const z0 = Math.round( Math.min(Math.max(minZoom, z + zoomDelta), maxZoom) );
    const k = Math.pow(2, z - z0) * tileSize;
    const x = +translate_[0] - scale_ / 2;
    const y = +translate_[1] - scale_ / 2;
    const xmin = Math.max(clampX ? 0 : -Infinity, Math.floor((x0 - x) / k));
    const xmax = Math.min(clampX ? 1 << z0 : Infinity, Math.ceil((x1 - x) / k));
    const ymin = Math.max(clampY ? 0 : -Infinity, Math.floor((y0 - y) / k));
    const ymax = Math.min(clampY ? 1 << z0 : Infinity, Math.ceil((y1 - y) / k));
    const tiles = [];
    tiles.translate = [x / k, y / k];
    tiles.scale = k;
    for (let y = ymin; y < ymax; ++y) {
      for (let x = xmin; x < xmax; ++x) {
        tiles.push([x, y, z0]);
      }
    }
    return tiles;
  }

  tile.size = function(_) {
    return arguments.length ? (x0 = y0 = 0, x1 = +_[0], y1 = +_[1], tile) : [x1 - x0, y1 - y0];
  };

  tile.extent = function(_) {
    return arguments.length ? (x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1], tile) : [[x0, y0], [x1, y1]];
  };

  tile.scale = function(_) {
    return arguments.length ? (scale = typeof _ === "function" ? _ : constant(+_), tile) : scale;
  };

  tile.translate = function(_) {
    return arguments.length ? (translate = typeof _ === "function" ? _ : constant([+_[0], +_[1]]), tile) : translate;
  };

  tile.zoomDelta = function(_) {
    return arguments.length ? (zoomDelta = +_, tile) : zoomDelta;
  };

  tile.maxZoom = function(_) {
    return arguments.length ? (maxZoom = +_, tile) : maxZoom;
  };

  tile.tileSize = function(_) {
    return arguments.length ? (tileSize = +_, tile) : tileSize;
  };

  tile.clamp = function(_) {
    return arguments.length ? (clampX = clampY = !!_, tile) : clampX && clampY;
  };

  tile.clampX = function(_) {
    return arguments.length ? (clampX = !!_, tile) : clampX;
  };

  tile.clampY = function(_) {
    return arguments.length ? (clampY = !!_, tile) : clampY;
  };

  return tile;
}

function tileWrap([x, y, z]) {
  const j = 1 << z;
  return [x - Math.floor(x / j) * j, y - Math.floor(y / j) * j, z];
}

function getTileMetric(layout, tileset, padding = 0.595) {
  const zoom = tileset[0][2];
  const nTiles = 2 ** zoom;
  const scaleFac = layout.tileSize() / tileset.scale;
  const mapResolution = 
    Math.min(Math.max(1.0 / Math.sqrt(2), scaleFac), Math.sqrt(2));

  function wrap(x, xmax) {
    while (x < 0) x += xmax;
    while (x >= xmax) x -= xmax;
    return x;
  }

  // Map is viewport + padding. Store the map cornerpoints in tile units
  const [vpWidth, vpHeight] = layout.size();
  const pad = padding * mapResolution; // In tile units
  const x0 = wrap(-tileset.translate[0] - pad, nTiles);
  const x1 = x0 + vpWidth / tileset.scale + 2 * pad; // May cross antimeridian
  const y0 = -tileset.translate[1] - pad;
  const y1 = y0 + vpHeight / tileset.scale + 2 * pad;

  return function(tile) {
    let zoomFac = 2 ** (zoom - tile.z);
    let tileResolution = Math.min(1, mapResolution / zoomFac);

    // Convert the tile cornerpoints to tile units at MAP zoom level
    let tb = {
      x0: tile.x * zoomFac,
      x1: (tile.x + 1) * zoomFac,
      y0: tile.y * zoomFac,
      y1: (tile.y + 1) * zoomFac
    };

    // Find intersections of map and tile. Be careful with the antimeridian
    let xOverlap = Math.max(
      // Test for intersection with the tile in its raw position
      Math.min(x1, tb.x1) - Math.max(x0, tb.x0),
      // Test with the tile shifted across the antimeridian
      Math.min(x1, tb.x1 + nTiles) - Math.max(x0, tb.x0 + nTiles)
    );
    let yOverlap = Math.min(y1, tb.y1) - Math.max(y0, tb.y0);
    let overlapArea = Math.max(0, xOverlap) * Math.max(0, yOverlap);
    let visibleArea = overlapArea / mapResolution ** 2;

    // Flip sign to put most valuable tiles at the minimum. TODO: unnecessary?
    return 1.0 - visibleArea * tileResolution;
  };
}

function initTileGrid({ key, source, tileCache }) {
  const { tileSize = 512, maxzoom = 30 } = source;
  const outOfBounds = initBoundsCheck(source);

  var numTiles = 0;

  // Set up the tile layout
  const layout = tile()
    .tileSize(tileSize * Math.sqrt(2)) // Don't let d3-tile squeeze the tiles
    .maxZoom(maxzoom)
    .clampX(false); // Allow panning across the antimeridian

  function getTiles(viewport, transform) {
    // Get the grid of tiles needed for the current viewport
    layout.size(viewport);
    const tiles = layout(transform);

    // Update tile priorities based on the new grid
    const metric = getTileMetric(layout, tiles, 1.0);
    tileCache.process(tile => { tile.priority = metric(tile); });
    numTiles = tileCache.drop(tile => tile.priority > 0.8);
    const stopCondition = ([z, x, y]) => {
      return outOfBounds(z, x, y) || metric({ z, x, y }) > 0.8;
    };

    // Retrieve a tile box for every tile in the grid
    var tilesDone = 0;
    const grid = tiles.map(([x, y, z]) => {
      let [xw, yw, zw] = tileWrap([x, y, z]);

      if (outOfBounds(zw, xw, yw)) {
        tilesDone += 1; // Count it as complete
        return;
      }

      let box = tileCache.retrieve([zw, xw, yw], stopCondition);
      if (!box) return;

      tilesDone += box.sw ** 2;
      return Object.assign(box, { x, y, z });
    }).filter(t => t !== undefined);

    grid.loaded = tilesDone / tiles.length;
    grid.scale = tiles.scale;
    grid.translate = tiles.translate.slice();

    return grid;
  }

  return { key, getTiles, numTiles: () => numTiles };
}

function initSources(style, context, coords) {
  const { glyphs, sources: sourceDescriptions, layers } = style;

  const caches = initCaches({ context, glyphs });
  const tilesets = {};
  const layerSources = layers.reduce((d, l) => (d[l.id] = l.source, d), {});

  const grids = Object.entries(sourceDescriptions).map(([key, source]) => {
    let subset = layers.filter(l => l.source === key);
    if (!subset.length) return;

    let tileCache = caches.addSource({ source, layers: subset });
    if (!tileCache) return;
    let grid = initTileGrid({ key, source, tileCache });

    grid.layers = subset;
    return grid;
  }).filter(s => s !== undefined);

  function loadTilesets(pixRatio = 1) {
    const transform = coords.getTransform(pixRatio);
    const viewport = coords.getViewport(pixRatio);
    grids.forEach(grid => {
      // Make sure data from this source is still being displayed
      if (!grid.layers.some(l => l.visible)) return;
      tilesets[grid.key] = grid.getTiles(viewport, transform);
    });
    caches.sortTasks();
    const loadStatus = Object.values(tilesets).map(t => t.loaded)
      .reduce((s, l) => s + l) / grids.length;
    return loadStatus;
  }

  return {
    tilesets,
    getLayerTiles: (layer) => tilesets[layerSources[layer]],
    loadTilesets,
    queuedTasks: caches.queuedTasks,
    reporter: caches.reporter,
  };
}

function initRenderer(context, style) {
  const { sources, spriteData: spriteObject, layers } = style;

  const painters = layers.map(layer => {
    let painter = context.initPainter(getStyleFuncs(layer));

    painter.visible = () => layer.visible;
    return painter;
  });

  return function(tilesets, zoom, pixRatio = 1) {
    context.prep();
    painters.forEach(painter => {
      if (zoom < painter.minzoom || painter.maxzoom < zoom) return;
      if (!painter.visible()) return;
      let tileset = tilesets[painter.source];
      painter({ tileset, zoom, pixRatio });
    });
  };
}

function getTileTransform(tile, extent, projection) {
  const { z, x, y } = tile;
  const nTiles = 2 ** z;
  const translate = [x, y];

  const transform = {
    // Global XY to local tile XY
    forward: (pt) => pt.map((g, i) => (g * nTiles - translate[i]) * extent),

    // Local tile XY to global XY
    inverse: (pt) => pt.map((l, i) => (l / extent + translate[i]) / nTiles),
  };

  return {
    forward: (pt) => transform.forward(projection.forward(pt)),
    inverse: (pt) => projection.inverse(transform.inverse(pt)),
  };
}

function transformFeatureCoords(feature, transform) {
  const { type, properties, geometry } = feature;

  return {
    type, properties,
    geometry: transformGeometry(geometry, transform),
  };
}

function transformGeometry(geometry, transform) {
  const { type, coordinates } = geometry;

  return {
    type,
    coordinates: transformCoords(type, coordinates, transform),
  };
}

function transformCoords(type, coordinates, transform) {
  switch (type) {
    case "Point":
      return transform(coordinates);

    case "MultiPoint":
    case "LineString":
      return coordinates.map(transform);

    case "MultiLineString":
    case "Polygon":
      return coordinates.map(ring => ring.map(transform));

    case "MultiPolygon":
      return coordinates.map(polygon => {
        return polygon.map(ring => ring.map(transform));
      });

    default:
      throw Error("transformCoords: unknown geometry type!");
  }
}

function unwrapExports (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var helpers = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module helpers
 */
/**
 * Earth Radius used with the Harvesine formula and approximates using a spherical (non-ellipsoid) Earth.
 *
 * @memberof helpers
 * @type {number}
 */
exports.earthRadius = 6371008.8;
/**
 * Unit of measurement factors using a spherical (non-ellipsoid) earth radius.
 *
 * @memberof helpers
 * @type {Object}
 */
exports.factors = {
    centimeters: exports.earthRadius * 100,
    centimetres: exports.earthRadius * 100,
    degrees: exports.earthRadius / 111325,
    feet: exports.earthRadius * 3.28084,
    inches: exports.earthRadius * 39.370,
    kilometers: exports.earthRadius / 1000,
    kilometres: exports.earthRadius / 1000,
    meters: exports.earthRadius,
    metres: exports.earthRadius,
    miles: exports.earthRadius / 1609.344,
    millimeters: exports.earthRadius * 1000,
    millimetres: exports.earthRadius * 1000,
    nauticalmiles: exports.earthRadius / 1852,
    radians: 1,
    yards: exports.earthRadius / 1.0936,
};
/**
 * Units of measurement factors based on 1 meter.
 *
 * @memberof helpers
 * @type {Object}
 */
exports.unitsFactors = {
    centimeters: 100,
    centimetres: 100,
    degrees: 1 / 111325,
    feet: 3.28084,
    inches: 39.370,
    kilometers: 1 / 1000,
    kilometres: 1 / 1000,
    meters: 1,
    metres: 1,
    miles: 1 / 1609.344,
    millimeters: 1000,
    millimetres: 1000,
    nauticalmiles: 1 / 1852,
    radians: 1 / exports.earthRadius,
    yards: 1 / 1.0936,
};
/**
 * Area of measurement factors based on 1 square meter.
 *
 * @memberof helpers
 * @type {Object}
 */
exports.areaFactors = {
    acres: 0.000247105,
    centimeters: 10000,
    centimetres: 10000,
    feet: 10.763910417,
    inches: 1550.003100006,
    kilometers: 0.000001,
    kilometres: 0.000001,
    meters: 1,
    metres: 1,
    miles: 3.86e-7,
    millimeters: 1000000,
    millimetres: 1000000,
    yards: 1.195990046,
};
/**
 * Wraps a GeoJSON {@link Geometry} in a GeoJSON {@link Feature}.
 *
 * @name feature
 * @param {Geometry} geometry input geometry
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature} a GeoJSON Feature
 * @example
 * var geometry = {
 *   "type": "Point",
 *   "coordinates": [110, 50]
 * };
 *
 * var feature = turf.feature(geometry);
 *
 * //=feature
 */
function feature(geom, properties, options) {
    if (options === void 0) { options = {}; }
    var feat = { type: "Feature" };
    if (options.id === 0 || options.id) {
        feat.id = options.id;
    }
    if (options.bbox) {
        feat.bbox = options.bbox;
    }
    feat.properties = properties || {};
    feat.geometry = geom;
    return feat;
}
exports.feature = feature;
/**
 * Creates a GeoJSON {@link Geometry} from a Geometry string type & coordinates.
 * For GeometryCollection type use `helpers.geometryCollection`
 *
 * @name geometry
 * @param {string} type Geometry Type
 * @param {Array<any>} coordinates Coordinates
 * @param {Object} [options={}] Optional Parameters
 * @returns {Geometry} a GeoJSON Geometry
 * @example
 * var type = "Point";
 * var coordinates = [110, 50];
 * var geometry = turf.geometry(type, coordinates);
 * // => geometry
 */
function geometry(type, coordinates, options) {
    switch (type) {
        case "Point": return point(coordinates).geometry;
        case "LineString": return lineString(coordinates).geometry;
        case "Polygon": return polygon(coordinates).geometry;
        case "MultiPoint": return multiPoint(coordinates).geometry;
        case "MultiLineString": return multiLineString(coordinates).geometry;
        case "MultiPolygon": return multiPolygon(coordinates).geometry;
        default: throw new Error(type + " is invalid");
    }
}
exports.geometry = geometry;
/**
 * Creates a {@link Point} {@link Feature} from a Position.
 *
 * @name point
 * @param {Array<number>} coordinates longitude, latitude position (each in decimal degrees)
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<Point>} a Point feature
 * @example
 * var point = turf.point([-75.343, 39.984]);
 *
 * //=point
 */
function point(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "Point",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.point = point;
/**
 * Creates a {@link Point} {@link FeatureCollection} from an Array of Point coordinates.
 *
 * @name points
 * @param {Array<Array<number>>} coordinates an array of Points
 * @param {Object} [properties={}] Translate these properties to each Feature
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north]
 * associated with the FeatureCollection
 * @param {string|number} [options.id] Identifier associated with the FeatureCollection
 * @returns {FeatureCollection<Point>} Point Feature
 * @example
 * var points = turf.points([
 *   [-75, 39],
 *   [-80, 45],
 *   [-78, 50]
 * ]);
 *
 * //=points
 */
function points(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    return featureCollection(coordinates.map(function (coords) {
        return point(coords, properties);
    }), options);
}
exports.points = points;
/**
 * Creates a {@link Polygon} {@link Feature} from an Array of LinearRings.
 *
 * @name polygon
 * @param {Array<Array<Array<number>>>} coordinates an array of LinearRings
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<Polygon>} Polygon Feature
 * @example
 * var polygon = turf.polygon([[[-5, 52], [-4, 56], [-2, 51], [-7, 54], [-5, 52]]], { name: 'poly1' });
 *
 * //=polygon
 */
function polygon(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    for (var _i = 0, coordinates_1 = coordinates; _i < coordinates_1.length; _i++) {
        var ring = coordinates_1[_i];
        if (ring.length < 4) {
            throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
        }
        for (var j = 0; j < ring[ring.length - 1].length; j++) {
            // Check if first point of Polygon contains two numbers
            if (ring[ring.length - 1][j] !== ring[0][j]) {
                throw new Error("First and last Position are not equivalent.");
            }
        }
    }
    var geom = {
        type: "Polygon",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.polygon = polygon;
/**
 * Creates a {@link Polygon} {@link FeatureCollection} from an Array of Polygon coordinates.
 *
 * @name polygons
 * @param {Array<Array<Array<Array<number>>>>} coordinates an array of Polygon coordinates
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the FeatureCollection
 * @returns {FeatureCollection<Polygon>} Polygon FeatureCollection
 * @example
 * var polygons = turf.polygons([
 *   [[[-5, 52], [-4, 56], [-2, 51], [-7, 54], [-5, 52]]],
 *   [[[-15, 42], [-14, 46], [-12, 41], [-17, 44], [-15, 42]]],
 * ]);
 *
 * //=polygons
 */
function polygons(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    return featureCollection(coordinates.map(function (coords) {
        return polygon(coords, properties);
    }), options);
}
exports.polygons = polygons;
/**
 * Creates a {@link LineString} {@link Feature} from an Array of Positions.
 *
 * @name lineString
 * @param {Array<Array<number>>} coordinates an array of Positions
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<LineString>} LineString Feature
 * @example
 * var linestring1 = turf.lineString([[-24, 63], [-23, 60], [-25, 65], [-20, 69]], {name: 'line 1'});
 * var linestring2 = turf.lineString([[-14, 43], [-13, 40], [-15, 45], [-10, 49]], {name: 'line 2'});
 *
 * //=linestring1
 * //=linestring2
 */
function lineString(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    if (coordinates.length < 2) {
        throw new Error("coordinates must be an array of two or more positions");
    }
    var geom = {
        type: "LineString",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.lineString = lineString;
/**
 * Creates a {@link LineString} {@link FeatureCollection} from an Array of LineString coordinates.
 *
 * @name lineStrings
 * @param {Array<Array<Array<number>>>} coordinates an array of LinearRings
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north]
 * associated with the FeatureCollection
 * @param {string|number} [options.id] Identifier associated with the FeatureCollection
 * @returns {FeatureCollection<LineString>} LineString FeatureCollection
 * @example
 * var linestrings = turf.lineStrings([
 *   [[-24, 63], [-23, 60], [-25, 65], [-20, 69]],
 *   [[-14, 43], [-13, 40], [-15, 45], [-10, 49]]
 * ]);
 *
 * //=linestrings
 */
function lineStrings(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    return featureCollection(coordinates.map(function (coords) {
        return lineString(coords, properties);
    }), options);
}
exports.lineStrings = lineStrings;
/**
 * Takes one or more {@link Feature|Features} and creates a {@link FeatureCollection}.
 *
 * @name featureCollection
 * @param {Feature[]} features input features
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {FeatureCollection} FeatureCollection of Features
 * @example
 * var locationA = turf.point([-75.343, 39.984], {name: 'Location A'});
 * var locationB = turf.point([-75.833, 39.284], {name: 'Location B'});
 * var locationC = turf.point([-75.534, 39.123], {name: 'Location C'});
 *
 * var collection = turf.featureCollection([
 *   locationA,
 *   locationB,
 *   locationC
 * ]);
 *
 * //=collection
 */
function featureCollection(features, options) {
    if (options === void 0) { options = {}; }
    var fc = { type: "FeatureCollection" };
    if (options.id) {
        fc.id = options.id;
    }
    if (options.bbox) {
        fc.bbox = options.bbox;
    }
    fc.features = features;
    return fc;
}
exports.featureCollection = featureCollection;
/**
 * Creates a {@link Feature<MultiLineString>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name multiLineString
 * @param {Array<Array<Array<number>>>} coordinates an array of LineStrings
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<MultiLineString>} a MultiLineString feature
 * @throws {Error} if no coordinates are passed
 * @example
 * var multiLine = turf.multiLineString([[[0,0],[10,10]]]);
 *
 * //=multiLine
 */
function multiLineString(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "MultiLineString",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.multiLineString = multiLineString;
/**
 * Creates a {@link Feature<MultiPoint>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name multiPoint
 * @param {Array<Array<number>>} coordinates an array of Positions
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<MultiPoint>} a MultiPoint feature
 * @throws {Error} if no coordinates are passed
 * @example
 * var multiPt = turf.multiPoint([[0,0],[10,10]]);
 *
 * //=multiPt
 */
function multiPoint(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "MultiPoint",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.multiPoint = multiPoint;
/**
 * Creates a {@link Feature<MultiPolygon>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name multiPolygon
 * @param {Array<Array<Array<Array<number>>>>} coordinates an array of Polygons
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<MultiPolygon>} a multipolygon feature
 * @throws {Error} if no coordinates are passed
 * @example
 * var multiPoly = turf.multiPolygon([[[[0,0],[0,10],[10,10],[10,0],[0,0]]]]);
 *
 * //=multiPoly
 *
 */
function multiPolygon(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "MultiPolygon",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.multiPolygon = multiPolygon;
/**
 * Creates a {@link Feature<GeometryCollection>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name geometryCollection
 * @param {Array<Geometry>} geometries an array of GeoJSON Geometries
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<GeometryCollection>} a GeoJSON GeometryCollection Feature
 * @example
 * var pt = turf.geometry("Point", [100, 0]);
 * var line = turf.geometry("LineString", [[101, 0], [102, 1]]);
 * var collection = turf.geometryCollection([pt, line]);
 *
 * // => collection
 */
function geometryCollection(geometries, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "GeometryCollection",
        geometries: geometries,
    };
    return feature(geom, properties, options);
}
exports.geometryCollection = geometryCollection;
/**
 * Round number to precision
 *
 * @param {number} num Number
 * @param {number} [precision=0] Precision
 * @returns {number} rounded number
 * @example
 * turf.round(120.4321)
 * //=120
 *
 * turf.round(120.4321, 2)
 * //=120.43
 */
function round(num, precision) {
    if (precision === void 0) { precision = 0; }
    if (precision && !(precision >= 0)) {
        throw new Error("precision must be a positive number");
    }
    var multiplier = Math.pow(10, precision || 0);
    return Math.round(num * multiplier) / multiplier;
}
exports.round = round;
/**
 * Convert a distance measurement (assuming a spherical Earth) from radians to a more friendly unit.
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
 *
 * @name radiansToLength
 * @param {number} radians in radians across the sphere
 * @param {string} [units="kilometers"] can be degrees, radians, miles, or kilometers inches, yards, metres,
 * meters, kilometres, kilometers.
 * @returns {number} distance
 */
function radiansToLength(radians, units) {
    if (units === void 0) { units = "kilometers"; }
    var factor = exports.factors[units];
    if (!factor) {
        throw new Error(units + " units is invalid");
    }
    return radians * factor;
}
exports.radiansToLength = radiansToLength;
/**
 * Convert a distance measurement (assuming a spherical Earth) from a real-world unit into radians
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
 *
 * @name lengthToRadians
 * @param {number} distance in real units
 * @param {string} [units="kilometers"] can be degrees, radians, miles, or kilometers inches, yards, metres,
 * meters, kilometres, kilometers.
 * @returns {number} radians
 */
function lengthToRadians(distance, units) {
    if (units === void 0) { units = "kilometers"; }
    var factor = exports.factors[units];
    if (!factor) {
        throw new Error(units + " units is invalid");
    }
    return distance / factor;
}
exports.lengthToRadians = lengthToRadians;
/**
 * Convert a distance measurement (assuming a spherical Earth) from a real-world unit into degrees
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, centimeters, kilometres, feet
 *
 * @name lengthToDegrees
 * @param {number} distance in real units
 * @param {string} [units="kilometers"] can be degrees, radians, miles, or kilometers inches, yards, metres,
 * meters, kilometres, kilometers.
 * @returns {number} degrees
 */
function lengthToDegrees(distance, units) {
    return radiansToDegrees(lengthToRadians(distance, units));
}
exports.lengthToDegrees = lengthToDegrees;
/**
 * Converts any bearing angle from the north line direction (positive clockwise)
 * and returns an angle between 0-360 degrees (positive clockwise), 0 being the north line
 *
 * @name bearingToAzimuth
 * @param {number} bearing angle, between -180 and +180 degrees
 * @returns {number} angle between 0 and 360 degrees
 */
function bearingToAzimuth(bearing) {
    var angle = bearing % 360;
    if (angle < 0) {
        angle += 360;
    }
    return angle;
}
exports.bearingToAzimuth = bearingToAzimuth;
/**
 * Converts an angle in radians to degrees
 *
 * @name radiansToDegrees
 * @param {number} radians angle in radians
 * @returns {number} degrees between 0 and 360 degrees
 */
function radiansToDegrees(radians) {
    var degrees = radians % (2 * Math.PI);
    return degrees * 180 / Math.PI;
}
exports.radiansToDegrees = radiansToDegrees;
/**
 * Converts an angle in degrees to radians
 *
 * @name degreesToRadians
 * @param {number} degrees angle between 0 and 360 degrees
 * @returns {number} angle in radians
 */
function degreesToRadians(degrees) {
    var radians = degrees % 360;
    return radians * Math.PI / 180;
}
exports.degreesToRadians = degreesToRadians;
/**
 * Converts a length to the requested unit.
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
 *
 * @param {number} length to be converted
 * @param {Units} [originalUnit="kilometers"] of the length
 * @param {Units} [finalUnit="kilometers"] returned unit
 * @returns {number} the converted length
 */
function convertLength(length, originalUnit, finalUnit) {
    if (originalUnit === void 0) { originalUnit = "kilometers"; }
    if (finalUnit === void 0) { finalUnit = "kilometers"; }
    if (!(length >= 0)) {
        throw new Error("length must be a positive number");
    }
    return radiansToLength(lengthToRadians(length, originalUnit), finalUnit);
}
exports.convertLength = convertLength;
/**
 * Converts a area to the requested unit.
 * Valid units: kilometers, kilometres, meters, metres, centimetres, millimeters, acres, miles, yards, feet, inches
 * @param {number} area to be converted
 * @param {Units} [originalUnit="meters"] of the distance
 * @param {Units} [finalUnit="kilometers"] returned unit
 * @returns {number} the converted distance
 */
function convertArea(area, originalUnit, finalUnit) {
    if (originalUnit === void 0) { originalUnit = "meters"; }
    if (finalUnit === void 0) { finalUnit = "kilometers"; }
    if (!(area >= 0)) {
        throw new Error("area must be a positive number");
    }
    var startFactor = exports.areaFactors[originalUnit];
    if (!startFactor) {
        throw new Error("invalid original units");
    }
    var finalFactor = exports.areaFactors[finalUnit];
    if (!finalFactor) {
        throw new Error("invalid final units");
    }
    return (area / startFactor) * finalFactor;
}
exports.convertArea = convertArea;
/**
 * isNumber
 *
 * @param {*} num Number to validate
 * @returns {boolean} true/false
 * @example
 * turf.isNumber(123)
 * //=true
 * turf.isNumber('foo')
 * //=false
 */
function isNumber(num) {
    return !isNaN(num) && num !== null && !Array.isArray(num) && !/^\s*$/.test(num);
}
exports.isNumber = isNumber;
/**
 * isObject
 *
 * @param {*} input variable to validate
 * @returns {boolean} true/false
 * @example
 * turf.isObject({elevation: 10})
 * //=true
 * turf.isObject('foo')
 * //=false
 */
function isObject(input) {
    return (!!input) && (input.constructor === Object);
}
exports.isObject = isObject;
/**
 * Validate BBox
 *
 * @private
 * @param {Array<number>} bbox BBox to validate
 * @returns {void}
 * @throws Error if BBox is not valid
 * @example
 * validateBBox([-180, -40, 110, 50])
 * //=OK
 * validateBBox([-180, -40])
 * //=Error
 * validateBBox('Foo')
 * //=Error
 * validateBBox(5)
 * //=Error
 * validateBBox(null)
 * //=Error
 * validateBBox(undefined)
 * //=Error
 */
function validateBBox(bbox) {
    if (!bbox) {
        throw new Error("bbox is required");
    }
    if (!Array.isArray(bbox)) {
        throw new Error("bbox must be an Array");
    }
    if (bbox.length !== 4 && bbox.length !== 6) {
        throw new Error("bbox must be an Array of 4 or 6 numbers");
    }
    bbox.forEach(function (num) {
        if (!isNumber(num)) {
            throw new Error("bbox must only contain numbers");
        }
    });
}
exports.validateBBox = validateBBox;
/**
 * Validate Id
 *
 * @private
 * @param {string|number} id Id to validate
 * @returns {void}
 * @throws Error if Id is not valid
 * @example
 * validateId([-180, -40, 110, 50])
 * //=Error
 * validateId([-180, -40])
 * //=Error
 * validateId('Foo')
 * //=OK
 * validateId(5)
 * //=OK
 * validateId(null)
 * //=Error
 * validateId(undefined)
 * //=Error
 */
function validateId(id) {
    if (!id) {
        throw new Error("id is required");
    }
    if (["string", "number"].indexOf(typeof id) === -1) {
        throw new Error("id must be a number or a string");
    }
}
exports.validateId = validateId;
// Deprecated methods
function radians2degrees() {
    throw new Error("method has been renamed to `radiansToDegrees`");
}
exports.radians2degrees = radians2degrees;
function degrees2radians() {
    throw new Error("method has been renamed to `degreesToRadians`");
}
exports.degrees2radians = degrees2radians;
function distanceToDegrees() {
    throw new Error("method has been renamed to `lengthToDegrees`");
}
exports.distanceToDegrees = distanceToDegrees;
function distanceToRadians() {
    throw new Error("method has been renamed to `lengthToRadians`");
}
exports.distanceToRadians = distanceToRadians;
function radiansToDistance() {
    throw new Error("method has been renamed to `radiansToLength`");
}
exports.radiansToDistance = radiansToDistance;
function bearingToAngle() {
    throw new Error("method has been renamed to `bearingToAzimuth`");
}
exports.bearingToAngle = bearingToAngle;
function convertDistance() {
    throw new Error("method has been renamed to `convertLength`");
}
exports.convertDistance = convertDistance;
});

unwrapExports(helpers);
helpers.earthRadius;
helpers.factors;
helpers.unitsFactors;
helpers.areaFactors;
helpers.feature;
helpers.geometry;
helpers.point;
helpers.points;
helpers.polygon;
helpers.polygons;
helpers.lineString;
helpers.lineStrings;
helpers.featureCollection;
helpers.multiLineString;
helpers.multiPoint;
helpers.multiPolygon;
helpers.geometryCollection;
helpers.round;
helpers.radiansToLength;
helpers.lengthToRadians;
helpers.lengthToDegrees;
helpers.bearingToAzimuth;
helpers.radiansToDegrees;
helpers.degreesToRadians;
helpers.convertLength;
helpers.convertArea;
helpers.isNumber;
helpers.isObject;
helpers.validateBBox;
helpers.validateId;
helpers.radians2degrees;
helpers.degrees2radians;
helpers.distanceToDegrees;
helpers.distanceToRadians;
helpers.radiansToDistance;
helpers.bearingToAngle;
helpers.convertDistance;

var invariant = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });

/**
 * Unwrap a coordinate from a Point Feature, Geometry or a single coordinate.
 *
 * @name getCoord
 * @param {Array<number>|Geometry<Point>|Feature<Point>} coord GeoJSON Point or an Array of numbers
 * @returns {Array<number>} coordinates
 * @example
 * var pt = turf.point([10, 10]);
 *
 * var coord = turf.getCoord(pt);
 * //= [10, 10]
 */
function getCoord(coord) {
    if (!coord) {
        throw new Error("coord is required");
    }
    if (!Array.isArray(coord)) {
        if (coord.type === "Feature" && coord.geometry !== null && coord.geometry.type === "Point") {
            return coord.geometry.coordinates;
        }
        if (coord.type === "Point") {
            return coord.coordinates;
        }
    }
    if (Array.isArray(coord) && coord.length >= 2 && !Array.isArray(coord[0]) && !Array.isArray(coord[1])) {
        return coord;
    }
    throw new Error("coord must be GeoJSON Point or an Array of numbers");
}
exports.getCoord = getCoord;
/**
 * Unwrap coordinates from a Feature, Geometry Object or an Array
 *
 * @name getCoords
 * @param {Array<any>|Geometry|Feature} coords Feature, Geometry Object or an Array
 * @returns {Array<any>} coordinates
 * @example
 * var poly = turf.polygon([[[119.32, -8.7], [119.55, -8.69], [119.51, -8.54], [119.32, -8.7]]]);
 *
 * var coords = turf.getCoords(poly);
 * //= [[[119.32, -8.7], [119.55, -8.69], [119.51, -8.54], [119.32, -8.7]]]
 */
function getCoords(coords) {
    if (Array.isArray(coords)) {
        return coords;
    }
    // Feature
    if (coords.type === "Feature") {
        if (coords.geometry !== null) {
            return coords.geometry.coordinates;
        }
    }
    else {
        // Geometry
        if (coords.coordinates) {
            return coords.coordinates;
        }
    }
    throw new Error("coords must be GeoJSON Feature, Geometry Object or an Array");
}
exports.getCoords = getCoords;
/**
 * Checks if coordinates contains a number
 *
 * @name containsNumber
 * @param {Array<any>} coordinates GeoJSON Coordinates
 * @returns {boolean} true if Array contains a number
 */
function containsNumber(coordinates) {
    if (coordinates.length > 1 && helpers.isNumber(coordinates[0]) && helpers.isNumber(coordinates[1])) {
        return true;
    }
    if (Array.isArray(coordinates[0]) && coordinates[0].length) {
        return containsNumber(coordinates[0]);
    }
    throw new Error("coordinates must only contain numbers");
}
exports.containsNumber = containsNumber;
/**
 * Enforce expectations about types of GeoJSON objects for Turf.
 *
 * @name geojsonType
 * @param {GeoJSON} value any GeoJSON object
 * @param {string} type expected GeoJSON type
 * @param {string} name name of calling function
 * @throws {Error} if value is not the expected type.
 */
function geojsonType(value, type, name) {
    if (!type || !name) {
        throw new Error("type and name required");
    }
    if (!value || value.type !== type) {
        throw new Error("Invalid input to " + name + ": must be a " + type + ", given " + value.type);
    }
}
exports.geojsonType = geojsonType;
/**
 * Enforce expectations about types of {@link Feature} inputs for Turf.
 * Internally this uses {@link geojsonType} to judge geometry types.
 *
 * @name featureOf
 * @param {Feature} feature a feature with an expected geometry type
 * @param {string} type expected GeoJSON type
 * @param {string} name name of calling function
 * @throws {Error} error if value is not the expected type.
 */
function featureOf(feature, type, name) {
    if (!feature) {
        throw new Error("No feature passed");
    }
    if (!name) {
        throw new Error(".featureOf() requires a name");
    }
    if (!feature || feature.type !== "Feature" || !feature.geometry) {
        throw new Error("Invalid input to " + name + ", Feature with geometry required");
    }
    if (!feature.geometry || feature.geometry.type !== type) {
        throw new Error("Invalid input to " + name + ": must be a " + type + ", given " + feature.geometry.type);
    }
}
exports.featureOf = featureOf;
/**
 * Enforce expectations about types of {@link FeatureCollection} inputs for Turf.
 * Internally this uses {@link geojsonType} to judge geometry types.
 *
 * @name collectionOf
 * @param {FeatureCollection} featureCollection a FeatureCollection for which features will be judged
 * @param {string} type expected GeoJSON type
 * @param {string} name name of calling function
 * @throws {Error} if value is not the expected type.
 */
function collectionOf(featureCollection, type, name) {
    if (!featureCollection) {
        throw new Error("No featureCollection passed");
    }
    if (!name) {
        throw new Error(".collectionOf() requires a name");
    }
    if (!featureCollection || featureCollection.type !== "FeatureCollection") {
        throw new Error("Invalid input to " + name + ", FeatureCollection required");
    }
    for (var _i = 0, _a = featureCollection.features; _i < _a.length; _i++) {
        var feature = _a[_i];
        if (!feature || feature.type !== "Feature" || !feature.geometry) {
            throw new Error("Invalid input to " + name + ", Feature with geometry required");
        }
        if (!feature.geometry || feature.geometry.type !== type) {
            throw new Error("Invalid input to " + name + ": must be a " + type + ", given " + feature.geometry.type);
        }
    }
}
exports.collectionOf = collectionOf;
/**
 * Get Geometry from Feature or Geometry Object
 *
 * @param {Feature|Geometry} geojson GeoJSON Feature or Geometry Object
 * @returns {Geometry|null} GeoJSON Geometry Object
 * @throws {Error} if geojson is not a Feature or Geometry Object
 * @example
 * var point = {
 *   "type": "Feature",
 *   "properties": {},
 *   "geometry": {
 *     "type": "Point",
 *     "coordinates": [110, 40]
 *   }
 * }
 * var geom = turf.getGeom(point)
 * //={"type": "Point", "coordinates": [110, 40]}
 */
function getGeom(geojson) {
    if (geojson.type === "Feature") {
        return geojson.geometry;
    }
    return geojson;
}
exports.getGeom = getGeom;
/**
 * Get GeoJSON object's type, Geometry type is prioritize.
 *
 * @param {GeoJSON} geojson GeoJSON object
 * @param {string} [name="geojson"] name of the variable to display in error message
 * @returns {string} GeoJSON type
 * @example
 * var point = {
 *   "type": "Feature",
 *   "properties": {},
 *   "geometry": {
 *     "type": "Point",
 *     "coordinates": [110, 40]
 *   }
 * }
 * var geom = turf.getType(point)
 * //="Point"
 */
function getType(geojson, name) {
    if (geojson.type === "FeatureCollection") {
        return "FeatureCollection";
    }
    if (geojson.type === "GeometryCollection") {
        return "GeometryCollection";
    }
    if (geojson.type === "Feature" && geojson.geometry !== null) {
        return geojson.geometry.type;
    }
    return geojson.type;
}
exports.getType = getType;
});

unwrapExports(invariant);
invariant.getCoord;
invariant.getCoords;
invariant.containsNumber;
invariant.geojsonType;
invariant.featureOf;
invariant.collectionOf;
invariant.getGeom;
invariant.getType;

var booleanPointInPolygon_1 = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });

// http://en.wikipedia.org/wiki/Even%E2%80%93odd_rule
// modified from: https://github.com/substack/point-in-polygon/blob/master/index.js
// which was modified from http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
/**
 * Takes a {@link Point} and a {@link Polygon} or {@link MultiPolygon} and determines if the point
 * resides inside the polygon. The polygon can be convex or concave. The function accounts for holes.
 *
 * @name booleanPointInPolygon
 * @param {Coord} point input point
 * @param {Feature<Polygon|MultiPolygon>} polygon input polygon or multipolygon
 * @param {Object} [options={}] Optional parameters
 * @param {boolean} [options.ignoreBoundary=false] True if polygon boundary should be ignored when determining if
 * the point is inside the polygon otherwise false.
 * @returns {boolean} `true` if the Point is inside the Polygon; `false` if the Point is not inside the Polygon
 * @example
 * var pt = turf.point([-77, 44]);
 * var poly = turf.polygon([[
 *   [-81, 41],
 *   [-81, 47],
 *   [-72, 47],
 *   [-72, 41],
 *   [-81, 41]
 * ]]);
 *
 * turf.booleanPointInPolygon(pt, poly);
 * //= true
 */
function booleanPointInPolygon(point, polygon, options) {
    if (options === void 0) { options = {}; }
    // validation
    if (!point) {
        throw new Error("point is required");
    }
    if (!polygon) {
        throw new Error("polygon is required");
    }
    var pt = invariant.getCoord(point);
    var geom = invariant.getGeom(polygon);
    var type = geom.type;
    var bbox = polygon.bbox;
    var polys = geom.coordinates;
    // Quick elimination if point is not inside bbox
    if (bbox && inBBox(pt, bbox) === false) {
        return false;
    }
    // normalize to multipolygon
    if (type === "Polygon") {
        polys = [polys];
    }
    var insidePoly = false;
    for (var i = 0; i < polys.length && !insidePoly; i++) {
        // check if it is in the outer ring first
        if (inRing(pt, polys[i][0], options.ignoreBoundary)) {
            var inHole = false;
            var k = 1;
            // check for the point in any of the holes
            while (k < polys[i].length && !inHole) {
                if (inRing(pt, polys[i][k], !options.ignoreBoundary)) {
                    inHole = true;
                }
                k++;
            }
            if (!inHole) {
                insidePoly = true;
            }
        }
    }
    return insidePoly;
}
exports.default = booleanPointInPolygon;
/**
 * inRing
 *
 * @private
 * @param {Array<number>} pt [x,y]
 * @param {Array<Array<number>>} ring [[x,y], [x,y],..]
 * @param {boolean} ignoreBoundary ignoreBoundary
 * @returns {boolean} inRing
 */
function inRing(pt, ring, ignoreBoundary) {
    var isInside = false;
    if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
        ring = ring.slice(0, ring.length - 1);
    }
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var xi = ring[i][0];
        var yi = ring[i][1];
        var xj = ring[j][0];
        var yj = ring[j][1];
        var onBoundary = (pt[1] * (xi - xj) + yi * (xj - pt[0]) + yj * (pt[0] - xi) === 0) &&
            ((xi - pt[0]) * (xj - pt[0]) <= 0) && ((yi - pt[1]) * (yj - pt[1]) <= 0);
        if (onBoundary) {
            return !ignoreBoundary;
        }
        var intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
            (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
        if (intersect) {
            isInside = !isInside;
        }
    }
    return isInside;
}
/**
 * inBBox
 *
 * @private
 * @param {Position} pt point [x,y]
 * @param {BBox} bbox BBox [west, south, east, north]
 * @returns {boolean} true/false if point is inside BBox
 */
function inBBox(pt, bbox) {
    return bbox[0] <= pt[0] &&
        bbox[1] <= pt[1] &&
        bbox[2] >= pt[0] &&
        bbox[3] >= pt[1];
}
});

var booleanPointInPolygon = unwrapExports(booleanPointInPolygon_1);

function initSelector(sources, projection) {
  const tileSize = 512; // TODO: don't assume this

  return function({ layer, point, radius = 5 }) {
    const tileset = sources.getLayerTiles(layer);
    if (!tileset || !tileset.length) return;

    // Find the tile, and get the layer features
    const nTiles = 2 ** tileset[0].z;
    const [ix, iy] = projection.forward(point)
      .map(c => Math.floor(c * nTiles));
    const tileBox = tileset.find(({ x, y }) => x == ix && y == iy);
    if (!tileBox) return;
    const dataLayer = tileBox.tile.data.layers[layer];
    if (!dataLayer) return;
    //const { features, extent = tileSize } = dataLayer;
    const { features } = dataLayer;
    const extent = tileSize; // TODO: use data extent
    if (!features || !features.length) return;

    // Convert point to tile coordinates
    const transform = getTileTransform(tileBox.tile, extent, projection);
    const tileXY = transform.forward(point);

    // Find the nearest feature
    const { distance, feature } = features.reduce((nearest, feature) => {
      let distance = measureDistance(tileXY, feature.geometry);
      if (distance < nearest.distance) nearest = { distance, feature };
      return nearest;
    }, { distance: Infinity });

    // Threshold distance should be in units of screen pixels
    const threshold = radius * extent / tileset.scale * tileBox.sw;
    if (distance > threshold) return;

    // Convert feature coordinates from tile XY units back to input units
    return transformFeatureCoords(feature, transform.inverse);
  };
}

function measureDistance(pt, geometry) {
  const { type, coordinates } = geometry;

  switch (type) {
    case "Point":
      let [x, y] = coordinates;
      return Math.sqrt((x - pt[0]) ** 2 + (y - pt[1]) ** 2);
    case "Polygon":
    case "MultiPolygon":
      return booleanPointInPolygon(pt, geometry) ? 0 : Infinity;
    default:
      return; // Unknown feature type!
  }
}

function init$2$1(userParams) {
  const params = setParams$1(userParams);

  // Set up dummy API
  const api = {
    gl: params.gl,
    projection: params.projection,
    draw: () => null,
    select: () => null,
    when: params.eventHandler.addListener,
  };

  // Extend with coordinate methods (SEE coords.js for API)
  Object.assign(api, params.coords);

  // Get style document, parse
  api.promise = loadStyle(params.style, params.mapboxToken)
    .then( styleDoc => setup$2(styleDoc, params, api) );

  return api;
}

function setup$2(styleDoc, params, api) {
  const sources = initSources(styleDoc, params.context, api);
  sources.reporter.addEventListener("tileLoaded", 
    () => params.eventHandler.emitEvent("tileLoaded"),
    false);

  // Set up interactive toggling of layer visibility
  styleDoc.layers.forEach(l => {
    // TODO: use functionalized visibility from tile-stencil?
    let visibility = l.layout ? l.layout.visibility : false;
    l.visible = (!visibility || visibility === "visible");
  });

  function setLayerVisibility(id, visibility) {
    const layer = styleDoc.layers.find(l => l.id === id);
    if (layer) layer.visible = visibility;
  }
  api.hideLayer = (id) => setLayerVisibility(id, false);
  api.showLayer = (id) => setLayerVisibility(id, true);

  const render = initRenderer(params.context, styleDoc);

  api.draw = function(pixRatio = 1) {
    const loadStatus = sources.loadTilesets(pixRatio);
    render(sources.tilesets, api.getZoom(pixRatio), pixRatio);
    return loadStatus;
  };

  api.select = initSelector(sources, params.projection);
  
  return api;
}

function initMap(params) {
  const { context, width, height, style, mapboxToken } = params;
  const framebuffer = context.initFramebuffer({ width, height });

  return init$2$1({ context, framebuffer, style, mapboxToken, units: "radians" })
    .promise.then(api => setup$1(api, context, framebuffer.sampler))
    .catch(console.log);
}

function setup$1(api, context, sampler) {
  var loadStatus = 0;

  const texture = {
    sampler,
    camPos: new Float64Array([0.5, 0.5]),
    scale: new Float64Array(2),
    changed: true,
  };

  return {
    texture,
    loaded: () => loadStatus,
    draw,
    select,
    showLayer: (l) => (loadStatus = 0, api.showLayer(l)),
    hideLayer: (l) => (loadStatus = 0, api.hideLayer(l)),
    getZoom: api.getZoom,
  };

  function draw(camPos, radius, view) {
    let dMap = camPos[2] / radius *        // Normalize to radius = 1
      view.topEdge() * 2 / view.height() * // ray tangent per pixel
      api.projection.scale(camPos);

    let k = 1.0 / dMap;
    let zoom = Math.log2(k) - 9;

    api.setCenterZoom(camPos, zoom, 'radians');
    loadStatus = api.draw();

    texture.scale.set(api.getScale());
    texture.camPos.set(api.getCamPos());

    context.updateMips(sampler);
  }

  function select(layer, point, radius) {
    return api.select({ layer, point, radius, units: "radians" });
  }
}

function initView(porthole, fieldOfView) {
  // The porthole is an HTML element acting as a window into a 3D world
  // fieldOfView is the vertical view angle range in degrees (floating point)

  // Compute values for transformation between the 3D world and the 2D porthole
  var portRect, width, height, aspect;
  var tanFOV = Math.tan(fieldOfView * Math.PI / 180.0 / 2.0);
  const maxRay = [];

  computeRayParams(); // Set initial values

  return {
    element: porthole, // Back-reference
    changed: computeRayParams,

    width: () => width,
    height: () => height,
    topEdge: () => maxRay[1],   // tanFOV
    rightEdge: () => maxRay[0], // aspect * tanFOV
    maxRay, // TODO: is it good to expose local state?
    getRayParams,
  };

  function computeRayParams() {
    // Compute porthole size
    portRect = porthole.getBoundingClientRect();
    let newWidth = portRect.right - portRect.left;
    let newHeight = portRect.bottom - portRect.top;

    // Exit if no change
    if (width === newWidth && height === newHeight) return false;

    // Update stored values
    width = newWidth;
    height = newHeight;
    aspect = width / height;
    maxRay[0] = aspect * tanFOV;
    maxRay[1] = tanFOV; // Probably no change, but it is exposed externally

    // Let the calling program know that the porthole changed
    return true;
  }

  // Convert a position on the screen into tangents of the angles
  // (relative to screen normal) of a ray shooting off into the 3D space
  function getRayParams(rayVec, clientX, clientY) {
    // NOTE strange behavior of getBoundingClientRect()
    // rect.left and .top are equal to the coordinates given by clientX/Y
    // when the mouse is at the left top pixel in the box.
    // rect.right and .bottom are NOT equal to clientX/Y at the bottom
    // right pixel -- they are one more than the clientX/Y values.
    // Thus the number of pixels in the box is given by 
    //    porthole.clientWidth = rect.right - rect.left  (NO +1 !!)
    var x = clientX - portRect.left;
    var y = portRect.bottom - clientY - 1; // Flip sign to make +y upward

    // Normalized distances from center of box. We normalize by pixel DISTANCE
    // rather than pixel count, to ensure we get -1 and +1 at the ends.
    // (Confirm by considering the 2x2 case)
    var xratio = 2 * x / (width - 1) - 1;
    var yratio = 2 * y / (height - 1) -1;

    rayVec[0] = xratio * maxRay[0];
    rayVec[1] = yratio * maxRay[1];
    //rayVec[2] = -1.0;
    //rayVec[3] = 0.0;
    return;
  }
}

function initCursor() {
  // What does an animation need to know about the cursor at each frame?
  // First, whether the user did any of the following since the last frame:
  //  - Started new actions
  var touchStarted = false; // Touched or clicked the element
  var zoomStarted  = false; // Rotated mousewheel, or started two-finger touch
  //  - Changed something
  var moved  = false;       // Moved mouse or touch point
  var zoomed = false;       // Rotated mousewheel, or adjusted two-finger touch
  //  - Is potentially in the middle of something
  var tapping = false;      // No touchEnd, and no cursor motion
  //  - Ended actions
  var touchEnded = false;   // mouseup or touchend/cancel/leave
  var tapped = false;       // Completed a click or tap action

  // We also need to know the current cursor position and zoom scale
  var cursorX = 0;
  var cursorY = 0;
  var zscale = 1.0;

  // For tap/click reporting, we need to remember where the touch started
  var startX = 0;
  var startY = 0;
  // What is a click/tap and what is a drag? If the cursor moved more than
  // this threshold between touchStart and touchEnd, it is a drag
  const threshold = 6;

  return {
    // Methods to report local state. These protect local values, returning a copy
    touchStarted: () => touchStarted,
    zoomStarted:  () => zoomStarted,
    moved:        () => moved,
    zoomed:       () => zoomed,
    tapped:       () => tapped,
    touchEnded:   () => touchEnded,
    hasChanged:   () => (moved || zoomed || tapped),
    zscale:       () => zscale,
    x: () => cursorX,
    y: () => cursorY,

    // Methods to update local state
    startTouch,
    startZoom,
    move,
    zoom,
    endTouch,
    reset,
  };

  function startTouch(evnt) {
    cursorX = evnt.clientX;
    cursorY = evnt.clientY;
    touchStarted = true;
    startX = cursorX;
    startY = cursorY;
    tapping = true;
  }

  function startZoom(evnt) {
    // Store the cursor position
    cursorX = evnt.clientX;
    cursorY = evnt.clientY;
    zoomStarted = true;
    tapping = false;
  }

  function move(evnt) {
    cursorX = evnt.clientX;
    cursorY = evnt.clientY;
    moved = true;
    var dist = Math.abs(cursorX - startX) + Math.abs(cursorY - startY);
    if (dist > threshold) tapping = false;
  }

  function zoom(scale) {
    zscale *= scale;
    zoomed = true;
    tapping = false;
  }

  function endTouch() {
    if (touchStarted) {
      // Ending a new touch? Just ignore both // TODO: is this a good idea?
      touchStarted = false;
      touchEnded = false;
    } else {
      touchEnded = true;
    }
    tapped = tapping;
    tapping = false;
  }

  function reset() {
    touchStarted = false;
    zoomStarted  = false;
    moved  = false;
    zoomed = false;
    touchEnded = false;
    // NOTE: we do NOT reset tapping... this could carry over to next check
    tapped = false;
    zscale = 1.0;
  }
}

// Add event listeners to update the state of a cursor object
// Input div is an HTML element on which events will be registered
function initTouch(div) {
  const cursor = initCursor();

  // Remember the distance between two pointers
  var lastDistance = 1.0;
  
  // Capture the drag event so we can disable any default actions
  div.addEventListener('dragstart', function(drag) {
    drag.preventDefault();
    return false;
  }, false);

  // Add mouse events
  div.addEventListener('mousedown',   cursor.startTouch, false);
  div.addEventListener('mousemove',   cursor.move,       false);
  div.addEventListener('mouseup',     cursor.endTouch,   false);
  div.addEventListener('mouseleave',  cursor.endTouch,   false);
  div.addEventListener('wheel',       wheelZoom,         false);

  // Add touch events
  div.addEventListener('touchstart',  initTouch,       false);
  div.addEventListener('touchmove',   moveTouch,       false);
  div.addEventListener('touchend',    cursor.endTouch, false);
  div.addEventListener('touchcancel', cursor.endTouch, false);

  // Return a pointer to the cursor object
  return cursor;

  function initTouch(evnt) {
    evnt.preventDefault();
    switch (evnt.touches.length) {
      case 1: 
        cursor.startTouch(evnt.touches[0]);
        break;
      case 2:
        var midpoint = getMidPoint(evnt.touches[0], evnt.touches[1]);
        cursor.startTouch(midpoint);
        cursor.startZoom(midpoint);
        // Initialize the starting distance between touches
        lastDistance = midpoint.distance;
        break;
      default:
        cursor.endTouch(evnt);
    }
  }

  function moveTouch(evnt) {
    evnt.preventDefault();
    // NOTE: MDN says to add the touchmove handler within the touchstart handler
    // https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Using_Touch_Events
    switch (evnt.touches.length) {
      case 1:
        cursor.move(evnt.touches[0]);
        break;
      case 2:
        var midpoint = getMidPoint(evnt.touches[0], evnt.touches[1]);
        // Move the cursor to the midpoint
        cursor.move(midpoint);
        // Zoom based on the change in distance between the two touches
        cursor.zoom(lastDistance / midpoint.distance);
        // Remember the new touch distance
        lastDistance = midpoint.distance;
        break;
      default:
        return false;
    }
  }

  // Convert a two-touch event to a single event at the midpoint
  function getMidPoint(p0, p1) {
    var dx = p1.clientX - p0.clientX;
    var dy = p1.clientY - p0.clientY;
    return {
      clientX: p0.clientX + dx / 2,
      clientY: p0.clientY + dy / 2,
      distance: Math.sqrt(dx * dx + dy * dy),
    }
  }

  function wheelZoom(turn) {
    turn.preventDefault();
    cursor.startZoom(turn);
    // We ignore the dY from the browser, since it may be arbitrarily scaled
    // based on screen resolution or other factors. We keep only the sign.
    // See https://github.com/Leaflet/Leaflet/issues/4538
    var zoomScale = 1.0 + 0.2 * Math.sign(turn.deltaY);
    cursor.zoom(zoomScale);
  }
}

/**
 * Common utilities
 * @module glMatrix
 */
var ARRAY_TYPE = typeof Float32Array !== 'undefined' ? Float32Array : Array;
if (!Math.hypot) Math.hypot = function () {
  var y = 0,
      i = arguments.length;

  while (i--) {
    y += arguments[i] * arguments[i];
  }

  return Math.sqrt(y);
};

/**
 * 3 Dimensional Vector
 * @module vec3
 */

/**
 * Creates a new, empty vec3
 *
 * @returns {vec3} a new 3D vector
 */

function create() {
  var out = new ARRAY_TYPE(3);

  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }

  return out;
}
/**
 * Calculates the length of a vec3
 *
 * @param {vec3} a vector to calculate length of
 * @returns {Number} length of a
 */

function length(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return Math.hypot(x, y, z);
}
/**
 * Set the components of a vec3 to the given values
 *
 * @param {vec3} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} out
 */

function set(out, x, y, z) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
/**
 * Adds two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */

function add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}
/**
 * Subtracts vector b from vector a
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */

function subtract(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}
/**
 * Scales a vec3 by a scalar number
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec3} out
 */

function scale(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  return out;
}
/**
 * Adds two vec3's after scaling the second operand by a scalar value
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec3} out
 */

function scaleAndAdd(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  return out;
}
/**
 * Normalize a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to normalize
 * @returns {vec3} out
 */

function normalize(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var len = x * x + y * y + z * z;

  if (len > 0) {
    //TODO: evaluate use of glm_invsqrt here?
    len = 1 / Math.sqrt(len);
  }

  out[0] = a[0] * len;
  out[1] = a[1] * len;
  out[2] = a[2] * len;
  return out;
}
/**
 * Calculates the dot product of two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} dot product of a and b
 */

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
/**
 * Transforms the vec3 with a mat4.
 * 4th vector component is implicitly '1'
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec3} out
 */

function transformMat4(out, a, m) {
  var x = a[0],
      y = a[1],
      z = a[2];
  var w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1.0;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}
/**
 * Transforms the vec3 with a mat3.
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat3} m the 3x3 matrix to transform with
 * @returns {vec3} out
 */

function transformMat3(out, a, m) {
  var x = a[0],
      y = a[1],
      z = a[2];
  out[0] = x * m[0] + y * m[3] + z * m[6];
  out[1] = x * m[1] + y * m[4] + z * m[7];
  out[2] = x * m[2] + y * m[5] + z * m[8];
  return out;
}
/**
 * Perform some operation over an array of vec3s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec3. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec3s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */

(function () {
  var vec = create();
  return function (a, stride, offset, count, fn, arg) {
    var i, l;

    if (!stride) {
      stride = 3;
    }

    if (!offset) {
      offset = 0;
    }

    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }

    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
    }

    return a;
  };
}());

function initEcefToLocalGeo() {
  var sinLon, cosLon, sinLat, cosLat;
  const toENU = new Float64Array(9);

  return ecefToDeltaLonLatAlt;

  function ecefToDeltaLonLatAlt( delta, diff, anchor, viewPos ) {
    // Inputs are pointers to vec3s. anchor is a position in ECEF coordinates.
    // diff represents a differential change (e.g. motion?) near anchor.
    // Output delta will be the corresponding differentials in lon/lat/alt
    // viewPos represents the position of the model coordinates (ECEF) relative
    // to the view coordinates.    WARNING: diff will be overwritten

    // 1. Transform to local East-North-Up coordinates at the anchor location
    setupENU( anchor );
    transformMat3( diff, diff, toENU );

    // 2. Convert horizontal component to changes in longitude, latitude
    let r = length(anchor);
    delta[0] = diff[0] / r / (cosLat + 0.0001); // +0.0001 avoids /0
    delta[1] = diff[1] / r;
    delta[2] = diff[2];
    
    // 3. Latitudinal change is a rotation about an axis in the x-z plane, with
    // direction vec3.cross(anchor,North), or -East. We only want the component
    // rotating about the x-axis in view coordinates.
    delta[1] *= (
        Math.cos(viewPos[0]) * cosLon +
        Math.sin(viewPos[0]) * sinLon 
        );
    return;
  }

  function setupENU( normal ) {
    // Setup the matrix to rotate from global Earth-Centered-Earth-Fixed
    // to local East-North-Up coordinates. Assumptions for input ECEF:
    //    y-axis is the polar axis
    //   +z-axis points toward latitude = longitude = 0.
    // Input normal is an ellipsoid surface normal at the desired ENU origin

    // Update sines and cosines of the latitude and longitude of the normal
    const p2 = normal[0]**2 + normal[2]**2;
    const p = Math.sqrt(p2);
    if (p > 0) {
      sinLon = normal[0] / p;
      cosLon = normal[2] / p;
    } else {
      sinLon = 0.0;
      cosLon = 0.0;
    }
    const r = Math.sqrt(p2 + normal[1]**2);
    sinLat = normal[1] / r;
    cosLat = p / r;

    // Build matrix. Follows Widnal & Peraire (MIT) p.7, with the axes renamed:
    //   z -> y, y -> x, x -> z
    // Using OpenGL COLUMN-MAJOR format!!
    toENU[0] =  cosLon;
    toENU[1] = -sinLat * sinLon;
    toENU[2] =  cosLat * sinLon;

    toENU[3] =  0.0;
    toENU[4] =  cosLat;
    toENU[5] =  sinLat;

    toENU[6] = -sinLon;
    toENU[7] = -sinLat * cosLon;
    toENU[8] =  cosLat * cosLon;
    // Note: the rows of the matrix are the unit vectors along each axis:
    // Elements (0, 3, 6) = unit vector in East direction
    // Elements (1, 4, 7) = unit vector in North direction
    // Elements (2, 5, 8) = unit vector in Up direction
    return;
  }
}

function initEllipsoid() {
  // Store ellipsoid parameters
  const semiMajor = 6371.0;  // kilometers
  const semiMinor = 6371.0;  // kilometers
  const e2 = 1.0 - semiMinor**2 / semiMajor**2; // Ellipticity squared
  // https://en.wikipedia.org/wiki/Earth_radius#Mean_radius
  const meanRadius = (2.0 * semiMajor + semiMinor) / 3.0;

  // Working vectors for shootEllipsoid, findHorizon
  const mCam = new Float64Array(3);
  const mRay = new Float64Array(3);
  const dRay = new Float64Array(3);

  return {
    meanRadius: () => meanRadius,
    ecef2geocentric,
    ecefToDeltaLonLatAlt: initEcefToLocalGeo(),
    geodetic2ecef,
    shoot: shootEllipsoid,
    findHorizon,
  };

  function ecef2geocentric( gcPos, ecefPos ) {
    // Output gcPos is a pointer to a 3-element array, containing geocentric
    //  longitude & latitude (radians) and altitude (meters) coordinates
    // Input ecefPos is a pointer to a 3-element array, containing earth-
    //  centered earth-fixed x,y,z coordinates in the WebGL axis definition

    // Note: order of calculations is chosen to allow calls with same array
    // as input & output (gcPos, ecefPos point to same array)
    const p2 = ecefPos[0]**2 + ecefPos[2]**2; // Squared distance from polar axis

    gcPos[0] = Math.atan2( ecefPos[0], ecefPos[2] );     // Longitude
    gcPos[1] = Math.atan2( ecefPos[1], Math.sqrt(p2) );  // Latitude

    // NOTE: this "altitude" is distance from SPHERE, not ellipsoid
    gcPos[2] = Math.sqrt( p2 + ecefPos[1]**2 ) - meanRadius; // Altitude
    return;
  }

  function geodetic2ecef( ecef, geodetic ) {
    // Output ecef is a pointer to a 3-element array containing X,Y,Z values
    //   of the point in earth-centered earth-fixed (ECEF) coordinates
    // Input geodetic is a pointer to a 3-element array, containing
    //   longitude & latitude (in radians) and altitude (in meters)

    // Start from prime vertical radius of curvature -- see
    // https://en.wikipedia.org/wiki/Geographic_coordinate_conversion
    const sinLat = Math.sin( geodetic[1] );
    const primeVertRad = semiMajor / Math.sqrt( 1.0 - e2 * sinLat**2 );
    // Radial distance from y-axis:
    const p = (primeVertRad + geodetic[2]) * Math.cos(geodetic[1]);

    // Compute ECEF position
    ecef[0] = p * Math.sin(geodetic[0]);
    ecef[1] = (primeVertRad + geodetic[2]) * sinLat * (1.0 - e2);
    ecef[2] = p * Math.cos(geodetic[0]);
    return;
  }

  function shootEllipsoid(intersection, camera, rayVec) {
    // Inputs camera, rayVec are pointers to vec3s indicating the
    //   position of the camera and the direction of a ray shot from the camera,
    //   both in earth-centered earth-fixed (ECEF) coordinates
    // Output intersection is a pointer to a vec3 in ECEF coordinates indicating
    //   the position of the intersection of the ray with the ellipsoid
    // Return value indicates whether the ray did in fact intersect the spheroid

    // Math: solving for values t where || M (camera + t*rayVec) || = 1,
    //  where M is the matrix that scales the ellipsoid to the unit sphere,
    //  i.e., for P = (x,y,z), MP = (x/a, y/b, z/c). Since M is diagonal
    //  (ellipsoid aligned along coordinate axes) we just scale each coordinate.
    mCam.set([
        camera[0] / semiMajor, 
        camera[1] / semiMinor,
        camera[2] / semiMajor 
    ]);
    mRay.set([
        rayVec[0] / semiMajor, 
        rayVec[1] / semiMinor, 
        rayVec[2] / semiMajor 
    ]);

    // We now have <mRay,mRay>*t^2 + 2*<mRay,mCam>*t + <mCam,mCam> - 1 = 0
    const a = dot(mRay, mRay);
    const b = 2.0 * dot(mRay, mCam);
    const c = dot(mCam, mCam) - 1.0;
    const discriminant = b**2 - 4*a*c;

    const intersected = (discriminant >= 0);
    var t;
    if (intersected) {
      // We want the closest intersection, with smallest positive t
      // We assume b < 0, if ray is pointing back from camera to ellipsoid
      t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
    } else {
      // Find the point that comes closest to the unit sphere
      //   NOTE: this is NOT the closest point to the ellipsoid!
      //   And it is not even the point on the horizon! It is closer...
      // Minimize a*t^2 + b*t + c, by finding the zero of the derivative
      t = -0.5 * b / a;
    }

    // NOTE: rayVec is actually a vec4
    scaleAndAdd(intersection, camera, rayVec, t);
    return intersected;
  }

  function findHorizon(horizon, camera, rayVec) {
    // Find the point on the horizon under rayvec.
    // We first adjust rayVec to point it toward the horizon, and then
    // re-shoot the ellipsoid with the corrected ray

    // 1. Find the component of rayVec parallel to camera direction
    normalize(dRay, camera); // Unit vector along camera direction
    const paraLength = dot(dRay, rayVec);
    scale( dRay, dRay, paraLength );

    // 2. Find the component perpendicular to camera direction
    subtract( dRay, rayVec, dRay );
    const perpLength = length(dRay);
    if (perpLength == 0) return false; // No solution if ray is vertical

    // 3. Find the error of the length of the perpendicular component
    const sinAlpha = meanRadius / length(camera); // sin(angle to horizon)
    const tanAlpha = sinAlpha / Math.sqrt(1.0 - sinAlpha * sinAlpha);
    const dPerp = -paraLength * tanAlpha - perpLength;

    // 4. Find the corrected rayVec
    scaleAndAdd(dRay, rayVec, dRay, dPerp / perpLength);

    // 5. Re-shoot the ellipsoid with the corrected rayVec
    shootEllipsoid(horizon, camera, dRay);

    return true;
  }
}

/**
 * 4x4 Matrix<br>Format: column-major, when typed out it looks like row-major<br>The matrices are being post multiplied.
 * @module mat4
 */

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */

function create$1() {
  var out = new ARRAY_TYPE(16);

  if (ARRAY_TYPE != Float32Array) {
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
  }

  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}
/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */

function transpose(out, a) {
  // If we are transposing ourselves we can skip a few steps but have to cache some values
  if (out === a) {
    var a01 = a[1],
        a02 = a[2],
        a03 = a[3];
    var a12 = a[6],
        a13 = a[7];
    var a23 = a[11];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a01;
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a02;
    out[9] = a12;
    out[11] = a[14];
    out[12] = a03;
    out[13] = a13;
    out[14] = a23;
  } else {
    out[0] = a[0];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a[1];
    out[5] = a[5];
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a[2];
    out[9] = a[6];
    out[10] = a[10];
    out[11] = a[14];
    out[12] = a[3];
    out[13] = a[7];
    out[14] = a[11];
    out[15] = a[15];
  }

  return out;
}
/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */

function rotateX(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];

  if (a !== out) {
    // If the source and destination differ, copy the unchanged rows
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  } // Perform axis-specific matrix multiplication


  out[4] = a10 * c + a20 * s;
  out[5] = a11 * c + a21 * s;
  out[6] = a12 * c + a22 * s;
  out[7] = a13 * c + a23 * s;
  out[8] = a20 * c - a10 * s;
  out[9] = a21 * c - a11 * s;
  out[10] = a22 * c - a12 * s;
  out[11] = a23 * c - a13 * s;
  return out;
}
/**
 * Creates a matrix from the given angle around the Y axis
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.rotateY(dest, dest, rad);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */

function fromYRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad); // Perform axis-specific matrix multiplication

  out[0] = c;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = s;
  out[9] = 0;
  out[10] = c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}

function initECEF(ellipsoid, initialPos) {
  // From the geodetic position, we derive Earth-Centered Earth-Fixed (ECEF)
  // coordinates and a rotation matrix
  // These are suitable for rendering Relative To Eye (RTE), as described in
  // P Cozzi, 3D Engine Design for Virtual Globes, www.virtualglobebook.com
  const position = new Float64Array([0.0, 0.0, 0.0, 1.0]);
  const rotation = create$1();  // Note: single precision!! (Float32Array)
  const inverse  = create$1();

  const halfPi = Math.PI / 2.0;

  // Set initial values
  update(initialPos);

  return {
    position, // WARNING: Exposes local array to changes from outside
    rotation,
    inverse,
    update,
  };

  function update(geodetic) {
    // Limit rotation around screen x-axis to keep global North pointing up
    geodetic[1] = Math.min(Math.max(-halfPi, geodetic[1]), halfPi);
    // Avoid accumulation of large values in longitude
    if (geodetic[0] >  Math.PI) geodetic[0] -= 2.0 * Math.PI;
    if (geodetic[0] < -Math.PI) geodetic[0] += 2.0 * Math.PI;

    // Compute ECEF coordinates. NOTE WebGL coordinate convention: 
    // +x to right, +y to top of screen, and +z into the screen
    ellipsoid.geodetic2ecef( position, geodetic );

    // Rotation: y first, so it will be left of x operator in final matrix
    // (gl-matrix library 'post-multplies' by each new matrix)
    // Positive angles about Y are towards the +X axis, or East longitude.
    fromYRotation( rotation, geodetic[0] );
    // Positive angles about X are towards the -Y axis!
    // (from Y to Z, and Z to -Y). But geodetic[1] is a latitude, toward N
    rotateX( rotation, rotation, -geodetic[1] );

    // The inverse of a rotation matrix is its transpose
    transpose( inverse, rotation );
  }
}

/**
 * 4 Dimensional Vector
 * @module vec4
 */

/**
 * Creates a new, empty vec4
 *
 * @returns {vec4} a new 4D vector
 */

function create$2() {
  var out = new ARRAY_TYPE(4);

  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
  }

  return out;
}
/**
 * Transforms the vec4 with a mat4.
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec4} out
 */

function transformMat4$1(out, a, m) {
  var x = a[0],
      y = a[1],
      z = a[2],
      w = a[3];
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
  return out;
}
/**
 * Perform some operation over an array of vec4s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec4. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec4s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */

(function () {
  var vec = create$2();
  return function (a, stride, offset, count, fn, arg) {
    var i, l;

    if (!stride) {
      stride = 4;
    }

    if (!offset) {
      offset = 0;
    }

    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }

    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      vec[3] = a[i + 3];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
      a[i + 3] = vec[3];
    }

    return a;
  };
}());

function initEdgePoints(ellipsoid, camPos, camRot, screen) {
  // Allocate working arrays and variables
  const rayVec = new Float64Array([0.0, 0.0, -1.0, 0.0]);
  const camRay = new Float64Array(4);
  const rayHit = new Float64Array(3);
  var tanX, tanY;

  // Construct a list of points around the screen edges
  const screenPoints = [
    [-1.0, -1.0], // Bottom left
    [-0.5, -1.0],
    [ 0.0, -1.0], // Bottom center
    [ 0.5, -1.0],
    [ 1.0, -1.0], // Bottom right
    [ 1.0, -0.5],
    [ 1.0,  0.0], // Right center
    [ 1.0,  0.5],
    [ 1.0,  1.0], // Top right
    [ 0.5,  1.0],
    [ 0.0,  1.0], // Top center
    [-0.5,  1.0],
    [-1.0,  1.0], // Top left
    [-1.0,  0.5],
    [-1.0,  0.0], // Left center
    [-1.0, -0.5],
    [-1.0, -1.0], // Loop back to bottom left
  ];

  // An edgePoint is the point on the ellipsoid visible from screenPoint
  const edgePoints = screenPoints.map(pt => []);
  update();

  return {
    lonLats: edgePoints,  // WARNING: exposed to updates from outside!
    update,
  };

  function update() {
    // Update the view angles at the screen edges
    tanX = screen.rightEdge();
    tanY = screen.topEdge();

    // Find the ellipsoid intersection at each screen point
    screenPoints.forEach(shoot);
  }

  function shoot(screenPos, index) {
    // Construct the ray vector
    rayVec[0] = screenPos[0] * tanX;
    rayVec[1] = screenPos[1] * tanY;
    // Rotate to model coordinates (Earth-Centered Earth-Fixed)
    transformMat4$1(camRay, rayVec, camRot);

    // Find intersection of ray with ellipsoid
    var hit = ellipsoid.shoot(rayHit, camPos, camRay);
    // If it didn't intersect, find the nearest point on the horizon
    if (!hit) ellipsoid.findHorizon(rayHit, camPos, camRay);

    // Convert to longitude/latitude. NOTE: geocentric!!
    ellipsoid.ecef2geocentric(edgePoints[index], rayHit);
  }
}

function updateOscillator(pos, vel, ext, w0, dt, i1, i2) {
  // Update position and velocity for a critically damped oscillator, following
  // http://mathworld.wolfram.com/CriticallyDampedSimpleHarmonicMotion.html
  
  // Inputs/outputs pos, vel are pointers to arrays
  // Inputs w0, t are primitive floating point values, indicating the
  //   natural frequency of the oscillator and the time step
  // Inputs i1, i2 are primitive integer values, indicating components to update

  var expTerm = Math.exp( -w0 * dt );

  for (let i = i1; i <= i2; i++) {
    var tmp = (vel[i] + w0 * ext[i]) * dt * expTerm;
    vel[i] += (expTerm - 1) * vel[i] - w0 * tmp;
    pos[i] += (expTerm - 1) * ext[i] + tmp;
  }
  return;
}

// initZoom: Update camera altitude based on target set by mouse wheel events
//  or two-finger pinch movements
function initZoom( ellipsoid ) {
  const w0 = 14.14; // Natural frequency of oscillator
  ellipsoid.meanRadius() * 0.00001;
  ellipsoid.meanRadius() * 8.0;
  const minVelocity = 0.001;
  const maxRotation = 0.15;

  // NOTE: everything below ASSUMES mass = 1
  var minEnergy = 0.5 * minVelocity * minVelocity;
  var extension, kineticE, potentialE;
  const dPos = new Float64Array(3);

  return function( position, velocity, cursor3d, deltaTime, track ) {
    // Input cursor3d is a pointer to an object
    // Inputs position, velocity are pointers to 3-element arrays
    // Input deltaTime is a primitive floating point value

    var targetHeight = cursor3d.zoomTarget();

    // Save old altitude
    var oldAltitude = position[2];

    dPos[2] = position[2] - targetHeight;
    updateOscillator(position, velocity, dPos, w0, deltaTime, 2, 2);

    if (track) {
      // Adjust rotation to keep zoom location fixed on screen
      dPos.set(position);
      dragonflyStalk( dPos, cursor3d.zoomRay, cursor3d.zoomPosition, ellipsoid );
      // Restrict size of rotation in one time step
      subtract( dPos, dPos, position );
      var limited = limitRotation( dPos, maxRotation );
      add( position, position, dPos );
    }

    // Scale rotational velocity by the ratio of the height change
    var heightScale = position[2] / oldAltitude;
    velocity[0] *= heightScale;
    velocity[1] *= heightScale;

    if (cursor3d.isClicked() || limited) return;

    // Stop if we are already near steady state
    kineticE = 0.5 * velocity[2] ** 2;
    extension = position[2] - targetHeight;
    potentialE = 0.5 * (w0 * extension) ** 2;
    if (kineticE + potentialE < minEnergy * targetHeight) {
      targetHeight = position[2];
      velocity[2] = 0.0;
      cursor3d.stopZoom();
    }
    return;
  }
}

function limitRotation( dPos, maxRotation ) {
  // Input dPos is a pointer to a 2-element array containing lon, lat changes
  // maxRotation is a primitive floating point value

  // Check for longitude value crossing antimeridian
  if (dPos[0] >  Math.PI) dPos[0] -= 2.0 * Math.PI;
  if (dPos[0] < -Math.PI) dPos[0] += 2.0 * Math.PI;

  if (Math.abs(dPos[0]) > maxRotation) {
    var tmp = Math.min(Math.max(-maxRotation, dPos[0]), maxRotation) / dPos[0];
    dPos[0] *= tmp;
    dPos[1] *= tmp;
    return true;
  }
  return false;
}

// Given a 3D scene coordinate over which a zoom action was initiated,
// and a distance between the screen and the center of the 3D scene,
// compute the rotations required to align the 3D coordinate along
// the original screen ray.  See
// https://en.wikipedia.org/wiki/Dragonfly#Motion_camouflage
// TODO: Clean this up. Just use difference of lat/lon under ray?
function dragonflyStalk(outRotation, ray, scenePos, ellipsoid) {
  // Output outRotation is a pointer to a vec3
  // Input ray is a pointer to a vec3
  // Input scenePos is a pointer to a 3D cursor object

  // Find the ray-sphere intersection in unrotated model space coordinates
  var target = new Float64Array(3);
  var unrotatedCamPos = [0.0, 0.0, outRotation[2] + length(scenePos)];
  var onEllipse = ellipsoid.shoot(target, unrotatedCamPos, ray);
  if (!onEllipse) return; // No intersection!

  // Find the rotation about the y-axis required to bring scene point into 
  // the  x = target[0]  plane
  // First find distance of scene point from scene y-axis
  var sceneR = Math.sqrt( scenePos[0] ** 2 + scenePos[2] ** 2 );
  // If too short, exit rather than tipping poles out of y-z plane
  if ( sceneR < Math.abs(target[0]) ) return;
  var targetRotY = Math.asin( target[0] / sceneR );
  outRotation[0] = 
    Math.atan2( scenePos[0], scenePos[2] ) - // Y-angle of scene vector
    //Math.asin( target[0] / sceneR );       // Y-angle of target point
    targetRotY;

  // We now know the x and y coordinates of the scene vector after rotation
  // around the y-axis: (x = target[0], y = scenePos[1])
  // Find the z-coordinate so we can compute the remaining required rotation
  var zRotated = sceneR * Math.cos(targetRotY);

  // Find the rotation about the screen x-axis required to bring the scene
  // point into the target y = target[1] plane
  // Assumes 0 angle is aligned along Z, and angle > 0 is rotation toward -y !
  outRotation[1] = 
    Math.atan2( -1 * target[1], target[2] ) -  // X-angle of target point
    Math.atan2( -1 * scenePos[1], zRotated );  // X-angle of scene vector

  return;
}

// initRotation: Updates rotations and rotation velocities based on forces
// applied via a mouse click & drag event.
function initRotation( ellipsoid ) {
  const w0 = 40.0;
  const extension = new Float64Array(3);

  return function( position, velocity, mouse3d, deltaTime ) {
    // Input mouse3d is a pointer to a mouse object
    // Inputs position, velocity are pointers to vec3s
    // Input deltaTime is a primitive floating point value

    // Find the displacement of the clicked position on the globe
    // from the current mouse position
    subtract( extension, mouse3d.position, mouse3d.clickPosition );

    // Convert to changes in longitude, latitude, and altitude
    ellipsoid.ecefToDeltaLonLatAlt( extension, extension, 
        mouse3d.clickPosition, position );
    // Ignore altitude change for now
    extension[2] = 0.0;

    updateOscillator(position, velocity, extension, w0, deltaTime, 0, 1);
    return;
  }
}

// initCoast: Update rotations based on a freely spinning globe (no forces)
function initCoast( ellipsoid ) {
  const damping = 3.0;
  const radius = ellipsoid.meanRadius();
  const minSpeed = 0.03;

  var dvDamp = 0.0;

  return function( position, velocity, deltaTime ) {
    // Inputs rotation, rotationVel are pointers to 3-element arrays
    // Input deltaTime is a primitive value (floating point)
    // TODO: switch to exact formula? (not finite difference)

    if ( length(velocity) < minSpeed * position[2] / radius ) {
      // Rotation has almost stopped. Go ahead and stop all the way.
      set(velocity, 0.0, 0.0, 0.0);
      return false; // No change to position, no need to re-render
    }

    // Adjust previous velocities for damping over the past time interval
    dvDamp = -1.0 * damping * deltaTime;
    //vec3.scaleAndAdd(velocity, velocity, velocity, dvDamp);
    velocity[0] += velocity[0] * dvDamp;
    velocity[1] += velocity[1] * dvDamp;

    // Update rotations
    //vec3.scaleAndAdd(position, position, velocity, deltaTime);
    position[0] += velocity[0] * deltaTime;
    position[1] += velocity[1] * deltaTime;
    return true;    // Position changed, need to re-render
  };
}

function initProjector(ellipsoid, camPosition, camInverse, screen) {
  const rayVec = new Float64Array(3);
  const ecefTmp = new Float64Array(3);

  return {
    ecefToScreenRay,
    lonLatToScreenXY,
  };

  function lonLatToScreenXY(xy, lonLat) {
    ellipsoid.geodetic2ecef(ecefTmp, lonLat);
    const visible = ecefToScreenRay(rayVec, ecefTmp); // Overwrites rayVec!

    xy[0] = screen.width() * ( 1 + rayVec[0] / screen.rightEdge() ) / 2;
    xy[1] = screen.height() * ( 1 - rayVec[1] / screen.topEdge() ) / 2;
    return visible;
  }

  function ecefToScreenRay(screenRay, ecefPosition) {
    // For a given point on the ellipsoid (in ECEF coordinates) find the
    // rayVec from a given camera position that will intersect it
    
    // Translate to camera position
    subtract(rayVec, ecefPosition, camPosition);
    // rayVec now points from camera to ecef. The sign of the
    // dot product tells us whether it is beyond the horizon
    const visible = ( dot(rayVec, ecefPosition) < 0 );

    // Rotate to camera orientation
    transformMat4(screenRay, rayVec, camInverse);

    // Normalize to z = -1
    screenRay[0] /= -screenRay[2];
    screenRay[1] /= -screenRay[2];
    screenRay[2] = -1.0;

    return visible;
  }
}

function initCameraDynamics(screen, ellipsoid, initialPosition) {
  // Position & velocity are computed in latitude & longitude in radians, and
  //   altitude defined by distance along surface normal, in the same length
  //   units as semiMajor and semiMinor in ellipsoid.js
  const position = new Float64Array(initialPosition);
  const velocity = new Float64Array(3); // Initializes to [0,0,0]

  // Initialize ECEF position, rotation matrix, inverse, and update method
  const ecef = initECEF(ellipsoid, position);

  // Keep track of the longitude/latitude of the edges of the screen
  const edges = initEdgePoints(ellipsoid, ecef.position, ecef.rotation, screen);
  // Initialize transforms from ellipsoid to screen positions
  const projector = initProjector(ellipsoid, ecef.position, ecef.inverse, screen);

  // Initialize some values and working arrays
  var time = 0.0;
  const rayVec = new Float64Array(4);

  // Initialize values & update functions for translations & rotations
  const zoom   = initZoom(ellipsoid);
  const rotate = initRotation(ellipsoid);
  const coast  = initCoast(ellipsoid);

  // Return methods to read/update state
  return {
    position, // WARNING: Exposes local array to changes from outside
    edgesPos: edges.lonLats,

    ecefPos: ecef.position,
    rotation: ecef.rotation,
    inverse: ecef.inverse,

    lonLatToScreenXY: projector.lonLatToScreenXY,

    update,
    stopCoast,
    stopZoom,
  };

  function stopCoast() {
    velocity[0] = 0.0;
    velocity[1] = 0.0;
  }
  function stopZoom() { 
    velocity[2] = 0.0; 
  }

  function update(newTime, resized, cursor3d) {
    // Input time is a primitive floating point value
    // Input cursor3d is a pointer to an object
    const deltaTime = newTime - time;
    time = newTime;
    // If timestep too big, wait till next frame to update physics
    if (deltaTime > 0.25) return resized;

    var needToRender;
    if ( cursor3d.isClicked() ) {       // Rotate globe based on cursor drag
      rotate( position, velocity, cursor3d, deltaTime );
      needToRender = true;
    } else {                           // Let globe spin freely
      needToRender = coast( position, velocity, deltaTime );
    }
    if ( cursor3d.isZooming() ) {       // Update zoom
      // Update ECEF position and rotation/inverse matrices
      ecef.update(position);
      // Update 2D screen position of 3D zoom position
      var visible = projector.ecefToScreenRay( rayVec, cursor3d.zoomPosition );
      if (visible) {
        if ( cursor3d.isClicked() ) cursor3d.zoomRay.set(rayVec);
        zoom( position, velocity, cursor3d, deltaTime, cursor3d.zoomFixed() );
      } else {
        stopZoom(); // TODO: is this needed? Might want to keep coasting
        cursor3d.stopZoom();
      }
      needToRender = true;
    }

    needToRender = needToRender || resized;
    if (needToRender) {
      ecef.update(position);
      edges.update();
    }
    return needToRender;
  }
}

function initCursor3d(getRayParams, ellipsoid, initialPosition) {
  // Input getRayParams is a method from yawgl.screen, converting screen X/Y
  //  to a ray shooting into 3D space
  // Input initialPosition is a geodetic lon/lat/alt vector

  // Cursor positions are computed & stored in ECEF coordinates (x,y,z)
  const cursorPosition = new Float64Array(3);
  const clickPosition = new Float64Array(3);
  const zoomPosition = new Float64Array(3);
  // Derived geocentric longitude, latitude, altitude
  const cursorLonLat = new Float64Array(3);
  // Screen ray for the 2D cursor position
  const cursorRay = new Float64Array([0.0, 0.0, -1.0, 0.0]);

  // Flags about the cursor state
  var onScene = false;
  var clicked = false;
  var zooming = false;
  var wasTapped = false;
  // Whether to fix the screen position of the zoom
  var zoomFix = false;

  // Track target altitude for zooming
  var targetHeight = initialPosition[2];
  const minHeight = ellipsoid.meanRadius() * 0.00001;
  const maxHeight = ellipsoid.meanRadius() * 8.0;
  // Target screen ray for zooming
  const zoomRay = new Float64Array([0.0, 0.0, -1.0, 0.0]);

  // Local working vector
  const ecefRay = new Float64Array(4);

  // Return methods to read/update cursorPosition
  return {
    // POINTERs to local arrays. WARNING: local values can be changed from outside!
    position: cursorPosition, // TODO: why make the name more ambiguous?
    cursorLonLat,
    clickPosition,
    zoomPosition,
    zoomRay,

    // Methods to report local state.
    // These protect the local value, since primitives are passed by value
    isOnScene:  () => onScene,
    isClicked:  () => clicked,
    wasTapped:  () => wasTapped,
    isZooming:  () => zooming,
    zoomFixed:  () => zoomFix,
    zoomTarget: () => targetHeight,

    // Functions to update local state
    update,
    stopZoom,
  };

  function update(cursor2d, camera) {
    // Get screen ray in model coordinates (ECEF)
    getRayParams(cursorRay, cursor2d.x(), cursor2d.y());
    transformMat4$1(ecefRay, cursorRay, camera.rotation);

    // Find intersection of ray with ellipsoid
    onScene = ellipsoid.shoot(cursorPosition, camera.ecefPos, ecefRay);
    if (!onScene) {
      clicked = false;
      stopZoom(camera.position[2]);
      cursor2d.reset();
      return;
    }

    // Update cursor longitude/latitude
    ellipsoid.ecef2geocentric(cursorLonLat, cursorPosition);

    if ( cursor2d.touchEnded() ) {
      clicked = false;
      zoomFix = false;
    }
    wasTapped = cursor2d.tapped();

    if ( cursor2d.touchStarted() ) {
      // Set click position
      clicked = true;
      clickPosition.set(cursorPosition);
      // Assuming this is a click or single touch, stop zooming
      stopZoom(camera.position[2]);
      // Also stop any coasting in the altitude direction
      camera.stopZoom();
      // If this was actually a two-touch zoom, then cursor2d.zoomStarted()...
    }

    if ( cursor2d.zoomStarted() ) {
      zooming = true;
      zoomFix = true;
      zoomPosition.set(cursorPosition);
      zoomRay.set(cursorRay);
      if (!clicked) camera.stopCoast();
    }

    if ( cursor2d.zoomed() ) {
      zooming = true;
      targetHeight *= cursor2d.zscale();
      targetHeight = Math.min(Math.max(minHeight, targetHeight), maxHeight);
    }

    cursor2d.reset();
    return;
  }

  function stopZoom(height) {
    zooming = false;
    zoomFix = false;
    if (height !== undefined) targetHeight = height;
  }
}

const degrees = 180.0 / Math.PI;

function init$1(display, center, altitude) {
  // Input display is an HTML element where the ball will be represented
  // Input center is a pointer to a 2-element array containing initial
  // longitude and latitude for the camera
  // Input altitude is a floating point value indicating initial altitude

  // Add event handlers and position tracking to display element
  const cursor2d = initTouch(display);
  // Add a view object to compute ray parameters at points on the display
  const view = initView(display, 25.0);

  // Initialize ellipsoid, and methods for computing positions relative to it
  const ellipsoid = initEllipsoid();

  // Initialize camera dynamics: time, position, velocity, etc.
  // First check and convert user parameters for initial position
  var initialPos = (center && Array.isArray(center) && center.length === 2)
    ? [center[0] / degrees, center[1] / degrees]
    : [0.0, 0.0];
  initialPos[2] = (altitude)
    ? altitude
    : 4.0 * ellipsoid.meanRadius();
  const camera = initCameraDynamics(view, ellipsoid, initialPos);

  // Initialize interaction with the ellipsoid via the mouse and screen
  const cursor3d = initCursor3d(view.getRayParams, ellipsoid, camera.position);

  var camMoving, cursorChanged;

  return {
    view,

    radius:    ellipsoid.meanRadius,

    camMoving: () => camMoving,
    cameraPos: camera.position,
    edgesPos:  camera.edgesPos,

    lonLatToScreenXY: camera.lonLatToScreenXY,

    cursorPos: cursor3d.cursorLonLat,
    isOnScene: cursor3d.isOnScene,
    cursorChanged: () => cursorChanged,
    wasTapped: cursor3d.wasTapped,

    update,
  };

  function update(time) {
    // Input time is a primitive floating point value representing the 
    // time this function was called, in seconds

    // Check for changes in display size
    let resized = view.changed();

    // Update camera dynamics
    camMoving = camera.update(time, resized, cursor3d);

    // Update cursor positions, if necessary
    cursorChanged = cursor2d.hasChanged() || camMoving || cursor3d.wasTapped();
    if (cursorChanged) cursor3d.update(cursor2d, camera);

    return camMoving;
  }
}

function setParams(userParams) {
  const {
    context,
    pixelRatio,
    globeRadius = 6371,
    map,
    flipY = false,
  } = userParams;

  const getPixelRatio = (pixelRatio)
    ? () => userParams.pixelRatio
    : () => window.devicePixelRatio;
  // NOTE: getPixelRatio() returns the result of an object getter,
  //       NOT the property value at the time of getPixelRatio definition
  //  Thus, getPixelRatio will mirror any changes in the parent object

  const maps = Array.isArray(map)
    ? map
    : [map];

  if (!context || !(context.gl instanceof WebGLRenderingContext)) {
    throw("satellite-view: no valid WebGLRenderingContext!");
  }

  return { context, getPixelRatio, globeRadius, maps, flipY };
}

var vertexSrc = `attribute vec4 aVertexPosition;
uniform vec2 uMaxRay;

varying highp vec2 vRayParm;

void main(void) {
  vRayParm = uMaxRay * aVertexPosition.xy;
  gl_Position = aVertexPosition;
}
`;

var invertSrc = `uniform float uLat0;
uniform float uCosLat0;
uniform float uSinLat0;
uniform float uTanLat0;

float latChange(float x, float y, float sinC, float cosC) {
  float xtan = x * uTanLat0;
  float curveTerm = 0.5 * y * (xtan * xtan - y * y / 3.0);

  return (max(sinC, abs(sinC * uTanLat0) ) < 0.1)
    ? sinC * (y - sinC * (0.5 * xtan * x + curveTerm * sinC))
    : asin(uSinLat0 * cosC + y * uCosLat0 * sinC) - uLat0;
}

vec2 xyToLonLat(vec2 xy, float sinC, float cosC) {
  vec2 pHat = normalize(xy);
  float dLon = atan(pHat.x * sinC,
      uCosLat0 * cosC - pHat.y * uSinLat0 * sinC);
  float dLat = latChange(pHat.x, pHat.y, sinC, cosC);
  return vec2(dLon, dLat);
}
`;

var projectSrc = `const float ONEOVERTWOPI = 0.15915493667125702;

uniform float uExpY0;
uniform float uLatErr; // Difference of clipping to map limit

float smallTan(float x) {
  return (abs(x) < 0.1)
    ? x * (1.0 + x * x / 3.0)
    : tan(x);
}

float log1plusX(float x) {
  return (abs(x) < 0.15)
    ? x * (1.0 - x * (0.5 - x / 3.0 + x * x / 4.0))
    : log( 1.0 + max(x, -0.999) );
}

vec2 projMercator(vec2 dLonLat) {
  float tandlat = smallTan( 0.5 * (dLonLat[1] + uLatErr) );
  float p = tandlat * uExpY0;
  float q = tandlat / uExpY0;
  return vec2(dLonLat[0], log1plusX(q) - log1plusX(-p)) * ONEOVERTWOPI;
}
`;

function glslInterp(strings, ...expressions) {
  return strings.reduce( (acc, val, i) => acc + expressions[i-1]() + val );
}
var texLookup = (args) => glslInterp`const int nLod = ${args.nLod};

uniform sampler2D uTextureSampler[nLod];
uniform vec2 uCamMapPos[nLod];
uniform vec2 uMapScales[nLod];

float dateline(float x1) {
  // Choose the correct texture coordinate in fragments crossing the
  // antimeridian of a cylindrical coordinate system
  // See http://vcg.isti.cnr.it/~tarini/no-seams/

  // Alternate coordinate: forced across the antimeridian
  float x2 = fract(x1 + 0.5) - 0.5;
  // Choose the coordinate with the smaller screen-space derivative
  return (fwidth(x1) < fwidth(x2) + 0.001) ? x1 : x2;
}

bool inside(vec2 pos) {
  // Check if the supplied texture coordinate falls inside [0,1] X [0,1]
  // We adjust the limits slightly to ensure we are 1 pixel away from the edges
  return (
      0.001 < pos.x && pos.x < 0.999 &&
      0.001 < pos.y && pos.y < 0.999 );
}

vec4 sampleLOD(sampler2D samplers[nLod], vec2 coords[nLod]) {
  return ${args.buildSelector}texture2D(samplers[0], coords[0]);
}

vec4 texLookup(vec2 dMerc) {
  vec2 texCoords[nLod];

  for (int i = 0; i < nLod; i++) {
    texCoords[i] = uCamMapPos[i] + uMapScales[i] * dMerc;
    texCoords[i].x = dateline(texCoords[i].x);
  }

  return sampleLOD(uTextureSampler, texCoords);
}
`;

var dither2x2 = `float threshold(float val, float limit) {
  float decimal = fract(255.0 * val);
  float dithered = (decimal < limit)
    ? 0.0
    : 1.0;
  float adjustment = (dithered - decimal) / 255.0;
  return val + adjustment;
}

vec3 dither2x2(vec2 position, vec3 color) {
  // Based on https://github.com/hughsk/glsl-dither/blob/master/2x2.glsl
  int x = int( mod(position.x, 2.0) );
  int y = int( mod(position.y, 2.0) );
  int index = x + y * 2;

  float limit = 0.0;
  if (index == 0) limit = 0.25;
  if (index == 1) limit = 0.75;
  if (index == 2) limit = 1.00;
  if (index == 3) limit = 0.50;

  // Use limit to toggle color between adjacent 8-bit values
  return vec3(
      threshold(color.r, limit),
      threshold(color.g, limit),
      threshold(color.b, limit)
      );
}
`;

var fragMain = `float diffSqrt(float x) {
  // Returns 1 - sqrt(1-x), with special handling for small x
  float halfx = 0.5 * x;
  return (x < 0.1)
    ? halfx * (1.0 + 0.5 * halfx * (1.0 + halfx))
    : 1.0 - sqrt(1.0 - x);
}

float horizonTaper(float gamma) {
  // sqrt(gamma) = tan(ray_angle) / tan(horizon)
  float horizonRatio = sqrt(gamma);
  float delta = 2.0 * fwidth(horizonRatio);
  return 1.0 - smoothstep(1.0 - delta, 1.0, horizonRatio);
}

varying vec2 vRayParm;
uniform float uHnorm;

void main(void) {
  // 0. Pre-compute some values
  float p = length(vRayParm); // Tangent of ray angle
  float p2 = p * p;
  float gamma = p2 * uHnorm * (2.0 + uHnorm);
  float sinC = (uHnorm + diffSqrt(gamma)) * p / (1.0 + p2);
  float cosC = sqrt(1.0 - sinC * sinC);

  // 1. Invert for longitude and latitude perturbations relative to camera
  vec2 dLonLat = xyToLonLat(vRayParm, sinC, cosC);

  // 2. Project to a change in the Mercator coordinates
  vec2 dMerc = projMercator(dLonLat);

  // 3. Lookup color from the appropriate texture
  vec4 texelColor = texLookup(dMerc);

  // Add cosine shading, dithering, and horizon tapering
  vec3 dithered = dither2x2(gl_FragCoord.xy, cosC * texelColor.rgb);
  gl_FragColor = vec4(dithered.rgb, texelColor.a) * horizonTaper(gamma);
}
`;

const header = `
precision highp float;
precision highp sampler2D;

`;

function buildShader(nLod) {
  // Input nLod is the number of 'levels of detail' supplied
  // in the set of multi-resolution maps
  nLod = Math.max(1, Math.floor(nLod));

  // Execute the 'tagged template literal' added to texLookup.js.glsl by
  // ../../build/glsl-plugin.js. This will substitute nLod-dependent code
  const args = { // Properties MUST match ./texLookup.js.glsl
    nLod: () => nLod,
    buildSelector: () => buildSelector(nLod),
  };
  const texLookupSrc = texLookup(args);

  // Combine the GLSL-snippets into one shader source
  const fragmentSrc = header + invertSrc + projectSrc + 
    texLookupSrc + dither2x2 + fragMain;

  return {
    vert: vertexSrc,
    frag: fragmentSrc,
  };
}

function buildSelector(n) {
  // In the texLookup code, add lines to check each of the supplied textures,
  // and sample the highest LOD that contains the current coordinate
  var selector = ``;
  while (--n) selector += `inside(coords[${n}])
    ? texture2D(samplers[${n}], coords[${n}])
    : `;
  return selector;
}

const maxMercLat = 2.0 * Math.atan( Math.exp(Math.PI) ) - Math.PI / 2.0;

function init(userParams) {
  const params = setParams(userParams);
  const { context, maps, globeRadius } = params;

  // Initialize shader program
  const shaders = buildShader(maps.length);
  const program = context.initProgram(shaders.vert, shaders.frag);
  const { uniformSetters: setters, constructVao } = program;

  // Initialize VAO
  const aVertexPosition = context.initQuad();
  const vao = constructVao({ attributes: { aVertexPosition } });

  return {
    canvas: context.gl.canvas,
    draw,
    setPixelRatio: (ratio) => { params.getPixelRatio = () => ratio; },
    destroy: () => context.gl.canvas.remove(),
  };

  function draw(camPos, maxRayTan) {
    program.use();

    // Set uniforms related to camera position
    const lat = camPos[1];
    setters.uLat0(lat);
    setters.uCosLat0(Math.cos(lat));
    setters.uSinLat0(Math.sin(lat));
    setters.uTanLat0(Math.tan(lat));

    const clipLat = Math.min(Math.max(-maxMercLat, lat), maxMercLat);
    setters.uLatErr(lat - clipLat);
    setters.uExpY0(Math.tan(Math.PI / 4 + clipLat / 2));

    setters.uHnorm(camPos[2] / globeRadius);
    setters.uMaxRay(maxRayTan);

    setters.uCamMapPos(maps.flatMap(m => [m.camPos[0], 1.0 - m.camPos[1]]));
    setters.uMapScales(maps.flatMap(m => Array.from(m.scale)));
    setters.uTextureSampler(maps.map(m => m.sampler));

    // Draw the globe
    const resized = context.resizeCanvasToDisplaySize(params.getPixelRatio());

    context.bindFramebufferAndSetViewport();

    context.gl.pixelStorei(context.gl.UNPACK_FLIP_Y_WEBGL, params.flipY);

    context.clear();
    context.draw({ vao });

    return resized;
  }
}

// Update tooltip text when mouse or scene changes
function printToolTip(toolTip, ball) {
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

function initMarkers(globe, container) {
  const markerList = [];

  return {
    add,
    remove,
    update: () => markerList.forEach(setPosition),
  };

  function add({ element, type, lonLat, altitude }) {
    const marker = {
      element: getMarkerElement(element, type),
      // TODO: bad naming? lonLat includes altitude. Altitude currently unused
      lonLat: new Float64Array([...lonLat, altitude || 0.0]),
      screenPos: new Float64Array(2),
    };

    container.appendChild(marker.element);
    setPosition(marker);

    // Add to the list, and return the pointer to the user
    markerList.push(marker);
    return marker;
  }

  function getMarkerElement(element, type) {
    return (element && ["DIV", "IMG", "SVG"].includes(element.nodeName))
      ? element
      : createSVG(type);
  }

  function createSVG(type = "marker") {
    const svgNS = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", type);

    const use = document.createElementNS(svgNS, "use");
    // Reference the relevant sprite from the SVG appended in params.js
    use.setAttribute("href", "#" + type);
    svg.appendChild(use);

    return svg;
  }

  function remove(marker) {
    let index = markerList.indexOf(marker);
    if (index < 0) return;

    // Remove it from both the DOM and the list
    container.removeChild(marker.element);
    markerList.splice(index, 1);
  }

  function setPosition(marker) {
    const visible = globe.lonLatToScreenXY(marker.screenPos, marker.lonLat);

    Object.assign(marker.element.style, {
      display: (visible) ? "inline-block" : "none",
      left: marker.screenPos[0] + "px",
      top: marker.screenPos[1] + "px",
    });
  }
}

function initGlobe(userParams) {
  const params = setParams$2(userParams);

  return initMap(params)
    .then(map => setup(map, params))
    .catch(console.log);
}

function setup(map, params) {
  var requestID;

  const ball = init$1(params.globeDiv, params.center, params.altitude);
  const satView = init({
    context: params.context,
    globeRadius: ball.radius(),
    map: map.texture,
    flipY: false,
  });
  const markers = initMarkers(ball, params.globeDiv);

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

    destroy: () => (satView.destroy(), params.globeDiv.remove()),
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

export { initGlobe };
