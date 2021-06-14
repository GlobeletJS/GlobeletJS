import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import pkg from "../package.json";

export default {
  input: 'src/main.js',
  plugins: [
    resolve(),
    json(),
  ],
  output: {
    file: pkg.main,
    format: 'esm',
    name: pkg.name
  }
};
