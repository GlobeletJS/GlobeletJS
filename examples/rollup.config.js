var fs = require('fs');
import resolve from '@rollup/plugin-node-resolve';

// Get a list of the directory names
const dirNames = fs
  .readdirSync('./', { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

// Function to make a rollup config object from a directory name
function makeConfig(dir) {
  return {
    input: dir + '/main.js',
    plugins: [
      resolve(),
    ],
    output: {
      file: dir + '/main.min.js',
      format: 'iife',
      name: 'app',
    }
  };
}

// Export an array of config objects
export default dirNames.map(makeConfig);
