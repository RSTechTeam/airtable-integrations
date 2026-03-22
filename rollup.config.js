/** @fileoverview Configures [Rollup](https://rollupjs.org/). */

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import {nodeResolve} from '@rollup/plugin-node-resolve';
//import {fileURLToPath} from 'node:url';

export default {
  //external: [fileURLToPath(new URL('src/some-file.js', import.meta.url))],
  output: {
    format: 'es',
    esModule: true,
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve({preferBuiltins: true}),
    json(),
    commonjs(),
    replace({
      preventAssignment: true,
      __dirname: JSON.stringify(import.meta.dirname),
    }),
  ],
};
