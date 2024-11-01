/**
 * @fileoverview Lazy evaluated inputs
 * @see amtrav/action.yml
 */

import {getInput} from '../common/github_actions_core.js';

/** @type function(): string */
export const amtravCardId = getInput('amtrav-card-id');