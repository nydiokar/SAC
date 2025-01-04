import Mocha from 'mocha';
import * as path from 'path';
import { glob } from 'glob';

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        require: ['ts-node/register', 'tsconfig-paths/register']  // Add this
    });

    const testsRoot = path.resolve(__dirname, '..');
    // Change this to look for .test.ts files instead of .test.js
    const files = await glob('**/*.test.ts', { cwd: testsRoot });

    // Add files to the test suite
    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    try {
        // Run the mocha test
        await new Promise<void>((resolve, reject) => {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error(err);
        throw err;
    }
}