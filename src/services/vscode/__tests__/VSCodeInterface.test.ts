import { describe, it } from 'mocha';
import { expect } from 'chai';
import * as path from 'path';
import { TestVSCodeInterface } from '../TestVSCodeInterface';
import { VSCodeImplementation } from '../VSCodeImplementation';
import * as vscode from '../../../test/mocks/vscode';

describe('VSCode Interface', () => {
    describe('TestVSCodeInterface', () => {
        let testInterface: TestVSCodeInterface;

        beforeEach(() => {
            testInterface = new TestVSCodeInterface();
        });

        it('should initialize with mock context', () => {
            expect(testInterface.context).to.exist;
            expect(testInterface.context.subscriptions).to.be.an('array');
            expect(testInterface.context.globalState).to.exist;
            expect(testInterface.context.workspaceState).to.exist;
        });

        it('should return empty arrays for getters', () => {
            expect(testInterface.getVisibleTextEditors()).to.deep.equal([]);
            expect(testInterface.getWorkspaceFolders()).to.deep.equal([]);
            expect(testInterface.getTerminals()).to.deep.equal([]);
            expect(testInterface.getDiagnostics()).to.deep.equal([]);
        });

        it('should create file system watcher with mock methods', () => {
            const watcher = testInterface.createFileSystemWatcher();
            expect(watcher.dispose).to.be.a('function');
            expect(watcher.onDidChange).to.be.a('function');
            expect(watcher.onDidCreate).to.be.a('function');
            expect(watcher.onDidDelete).to.be.a('function');
        });
    });

    describe('VSCodeImplementation', () => {
        let vscodeImpl: VSCodeImplementation;
        const expectedWorkspacePath = path.normalize('/test/workspace');

        beforeEach(() => {
            const context = vscode.createExtensionContext();
            vscodeImpl = new VSCodeImplementation(vscode as any, context);
        });

        it('should use vscode mock for workspace folders', () => {
            const folders = vscodeImpl.getWorkspaceFolders();
            expect(folders).to.deep.equal([{
                uri: { fsPath: expectedWorkspacePath }
            }]);
        });

        it('should return workspace path from first folder', () => {
            const workspacePath = vscodeImpl.getWorkspacePath();
            expect(workspacePath).to.equal(expectedWorkspacePath);
        });

        it('should show messages using vscode window', async () => {
            await vscodeImpl.showMessage('test message');
            await vscodeImpl.showErrorMessage('test error');
            // These just verify the methods don't throw
        });

        it('should return empty arrays when no editors/terminals are open', () => {
            expect(vscodeImpl.getVisibleTextEditors()).to.deep.equal([]);
            expect(vscodeImpl.getTerminals()).to.deep.equal([]);
        });
    });
});
