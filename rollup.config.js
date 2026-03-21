/** @fileoverview Configures [Rollup](https://rollupjs.org/). */

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import {nodeResolve} from '@rollup/plugin-node-resolve';

export default {
  output: {
    format: 'es',
    esModule: true,
    sourcemap: true,
    inlineDynamicImports: true,
  },
  plugins: [commonjs(), json(), nodeResolve({preferBuiltins: true})],
};
