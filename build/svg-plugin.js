// Plugin for .svg files
export function svg() {
  return { transform };
}

function transform(source, id) {
  // Confirm filename extension is .svg
  if (/\.svg$/.test(id) === false) return;

  // Return as template literal
  return {
    code: "export default `" + source + "`",
    map: { mappings: '' }, // No map
  };
}
