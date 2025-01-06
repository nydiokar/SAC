import { register } from 'ts-node';
import * as path from 'path';
import { setupVSCodeMock } from './vscode';

// Register ts-node for TypeScript support
register({
    transpileOnly: true,
    project: './tsconfig.test.json'
});

// Setup VSCode mock
setupVSCodeMock();

// Store original process.cwd
const originalCwd = process.cwd;

// Mock process.cwd - normalize path for Windows
process.cwd = () => path.normalize('/test/workspace');

// Cleanup after tests
if (typeof global.after === 'function') {
    global.after(() => {
        process.cwd = originalCwd;
        delete require.cache[require.resolve('vscode')];
    });
}
