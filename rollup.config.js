/** @fileoverview Configures [Rollup](https://rollupjs.org/). */

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import {nodeResolve} from '@rollup/plugin-node-resolve';

export default {
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
