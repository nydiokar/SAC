import * as path from 'path';
import * as fs from 'fs';

export function setupVSCodeMock() {
    const vscodeMockDir = path.join(process.cwd(), 'node_modules', 'vscode');
    
    // Ensure the mock directory exists
    if (!fs.existsSync(vscodeMockDir)) {
        fs.mkdirSync(vscodeMockDir, { recursive: true });
    }

    // Create a basic mock module
    const mockContent = `
        const vscode = require('${path.join(process.cwd(), 'src/test/mocks/vscode').replace(/\\/g, '/')}');
        module.exports = vscode;
    `;

    // Write the mock files
    fs.writeFileSync(path.join(vscodeMockDir, 'package.json'), JSON.stringify({
        name: 'vscode',
        main: 'index.js'
    }, null, 2));
    
    fs.writeFileSync(path.join(vscodeMockDir, 'index.js'), mockContent);
}