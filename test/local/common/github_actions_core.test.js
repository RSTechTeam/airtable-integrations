import * as githubActionsCore from '../../../src/common/github_actions_core.js';
import * as core from '@actions/core';

jest.mock('@actions/core');

describe('githubActionsCore', () => {
  // Resets all information stored in the mock, including any initial implementation and mock name, but does not remove any mock implementation
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('log', () => {
    it('should call core.info with the provided message', () => {
      const message = 'Test message';
      githubActionsCore.log(message);
      expect(core.info).toHaveBeenCalledWith(message);
    });
  });

  describe('getInput', () => {
    it('should return a function that calls core.getInput with the provided input name', () => {
      const inputName = 'Test input';
      const getInputFunction = githubActionsCore.getInput(inputName);
      getInputFunction();
      expect(core.getInput).toHaveBeenCalledWith(inputName, { required: true });
    });
  });

  describe('error', () => {
    it('should call core.setFailed with the error message and throw the error', () => {
      const testError = new Error('Test error');
      expect(() => githubActionsCore.error(testError)).toThrow(testError);
      expect(core.setFailed).toHaveBeenCalledWith(testError);
    });
  });

  describe('logJson', () => {
    it('should call core.startGroup, core.info, and core.endGroup to log the provided JSON data', () => {
      const endpoint = 'Test endpoint';
      const jsonData = { key: 'value', array: [1, 2, 3] };
      githubActionsCore.logJson(endpoint, jsonData);
      expect(core.startGroup).toHaveBeenCalledWith(endpoint);
      expect(core.info).toHaveBeenCalledWith(JSON.stringify(jsonData, null, '\t'));
      expect(core.endGroup).toHaveBeenCalled();
    });

    it('should log individual expandable groups for each element of the top-level Array', () => {
      const endpoint = 'Test endpoint';
      const jsonData = { key: 'value', array: [ { id: 1 }, { id: 2 }, { id: 3 } ] };

      githubActionsCore.logJson(endpoint, jsonData);
      
      expect(core.startGroup).toHaveBeenCalledWith(endpoint);
      expect(core.info).toHaveBeenCalledWith(JSON.stringify(jsonData, expect.any(Function), '\t'));
      expect(core.startGroup).toHaveBeenCalledTimes(4);
      expect(core.endGroup).toHaveBeenCalledTimes(4);
    });
  });
});
