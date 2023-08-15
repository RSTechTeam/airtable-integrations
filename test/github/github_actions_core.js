/**
 * Test file for github_actions_core.js
 * 
 * The github_actions_core.js file provides functionalities for interacting with core GitHub Action functions.
 * It offers utilities to log information, get input values, handle errors, and log JSON data.
 */

import * as core from '@actions/core';
import { log, getInput, error, logJson } from '../src/common/github_actions_core.js';

describe('github_actions_core.js tests', () => {

    // Test the log function
    test('log function should log information', () => {
        const mockLog = jest.spyOn(core, 'info');
        log('Test message');
        expect(mockLog).toHaveBeenCalledWith('Test message');
    });

    // Test the getInput function
    test('getInput function should get input values', () => {
        const mockGetInput = jest.spyOn(core, 'getInput').mockReturnValue('testValue');
        const input = getInput('testInput')();
        expect(input).toBe('testValue');
    });

    // Test the error function
    test('error function should handle errors', () => {
        const mockSetFailed = jest.spyOn(core, 'setFailed');
        expect(() => error(new Error('Test error'))).toThrow('Test error');
        expect(mockSetFailed).toHaveBeenCalledWith(new Error('Test error'));
    });

    // Test the logJson function
    test('logJson function should log JSON data', () => {
        const mockStartGroup = jest.spyOn(core, 'startGroup');
        const mockEndGroup = jest.spyOn(core, 'endGroup');
        logJson('testEndpoint', { key: 'value' });
        expect(mockStartGroup).toHaveBeenCalled();
        expect(mockEndGroup).toHaveBeenCalled();
    });

    // Add more tests to cover other functionalities in the github_actions_core.js file
});

