/** @fileoverview Configures [Rollup](https://rollupjs.org/). */

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
//import nodeGlobals from 'rollup-plugin-node-globals';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import {fileURLToPath} from 'node:url';

export default {
  external: [fileURLToPath(new URL('src/some-file.js', import.meta.url))],
  output: {
    format: 'es',
    esModule: true,
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve({preferBuiltins: true}),
    commonjs(),
    json(),
    //nodeGlobals(),
  ],
};
