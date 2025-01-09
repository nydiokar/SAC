import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as path from 'path';
import * as vscode from '../mocks/vscode';

describe('VSCode Mock', () => {
    it('should mock workspace folders', () => {
        const expectedPath = path.normalize('/test/workspace');
        expect(vscode.workspace.workspaceFolders?.[0].uri.fsPath).to.equal(expectedPath);
    });

    it('should mock window functions', () => {
        expect(vscode.window.showInformationMessage).to.be.a('function');
        expect(vscode.window.showErrorMessage).to.be.a('function');
    });

    it('should create extension context', () => {
        const context = vscode.createExtensionContext();
        const expectedPath = path.normalize('/test/extension');
        expect(context.subscriptions).to.be.an('array');
        expect(context.extensionPath).to.equal(expectedPath);
        expect(context.globalState).to.exist;
        expect(context.workspaceState).to.exist;
    });
});
