import resolve from "@rollup/plugin-node-resolve";
import { svg } from "./svg-plugin.js";
import pkg from "../package.json";

export default {
  input: "src/main.js",
  plugins: [
    resolve(),
    svg(),
  ],
  output: [{
    file: pkg.module,
    format: "esm",
    name: pkg.name
  }, {
    file: pkg.main,
    format: "iife",
    name: pkg.name
  }],
};
