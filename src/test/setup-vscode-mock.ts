// Create a symlink to our mock vscode module
const fs = require('fs');
const path = require('path');

const mockPath = path.resolve(__dirname, 'mocks/vscode.js');
const nodePath = path.resolve(__dirname, '../../node_modules/vscode');

try {
    // Ensure node_modules/vscode exists
    if (!fs.existsSync(path.dirname(nodePath))) {
        fs.mkdirSync(path.dirname(nodePath), { recursive: true });
    }
    
    // Create symlink if it doesn't exist
    if (!fs.existsSync(nodePath)) {
        fs.symlinkSync(mockPath, nodePath, 'file');
    }
} catch (error) {
    console.error('Failed to setup vscode mock:', error);
}
