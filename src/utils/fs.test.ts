import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as fsUtils from './fs';
import fs from 'fs-extra';
import path from 'path';
import { beforeEach, describe, it, afterEach } from 'mocha';
import proxyquire from 'proxyquire';

// Enable chai-as-promised
use(chaiAsPromised);

// Mock vscode and get the ProjectContext with mocked dependencies
const { ProjectContext } = proxyquire('../services/project-context/ProjectContext', {
	'vscode': {
		workspace: {
			createFileSystemWatcher: () => ({
				onDidChange: () => ({ dispose: () => {} }),
				onDidCreate: () => ({ dispose: () => {} }),
				onDidDelete: () => ({ dispose: () => {} }),
				dispose: () => {}
			})
		},
		RelativePattern: class {
			constructor(public base: string, public pattern: string) {}
		},
		'@noCallThru': true
	}
});

describe('File System Utils with Validation', () => {
	let tempDir: string;
	let projectContext: any; // Type as any since we're using the mocked version

	beforeEach(async () => {
		tempDir = path.join(__dirname, 'temp_test_dir');
		await fs.ensureDir(tempDir);
		projectContext = new ProjectContext(tempDir, undefined, true);
		await projectContext.initialize();
	});

	afterEach(async () => {
		await fs.remove(tempDir);
	});

	describe('createDirectoriesForFile', () => {
		it('should create valid directories', async () => {
			const testPath = path.join(tempDir, 'test', 'nested', 'file.txt');
			const dirs = await fsUtils.createDirectoriesForFile(testPath, projectContext);
			expect(dirs).to.have.length.greaterThan(0);
			expect(await fsUtils.fileExistsAtPath(path.dirname(testPath))).to.be.true;
		});

		it('should reject creating directories in node_modules', async () => {
			const testPath = path.join(tempDir, 'node_modules', 'test', 'file.txt');
			await expect(fsUtils.createDirectoriesForFile(testPath, projectContext))
				.to.eventually.be.rejectedWith(/validation failed/);
		});
	});

	describe('writeFileWithValidation', () => {
		it('should write valid files', async () => {
			const testPath = path.join(tempDir, 'test.txt');
			await fsUtils.writeFileWithValidation(testPath, 'test content', projectContext);
			expect(await fsUtils.fileExistsAtPath(testPath)).to.be.true;
		});

		it('should reject writing to .env files', async () => {
			const testPath = path.join(tempDir, '.env');
			await expect(fsUtils.writeFileWithValidation(testPath, 'secret', projectContext))
				.to.eventually.be.rejectedWith(/validation failed/);
		});
	});

	describe('readFileWithValidation', () => {
		it('should read valid files', async () => {
			const testPath = path.join(tempDir, 'test.txt');
			await fs.writeFile(testPath, 'test content');
			const content = await fsUtils.readFileWithValidation(testPath, projectContext);
			expect(content.toString()).to.equal('test content');
		});

		it('should reject reading from restricted paths', async () => {
			const testPath = path.join(tempDir, '.git', 'config');
			await expect(fsUtils.readFileWithValidation(testPath, projectContext))
				.to.eventually.be.rejectedWith(/validation failed/);
		});
	});
});
