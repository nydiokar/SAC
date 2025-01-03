import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectContext, FileChange } from '../ProjectContext';
import assert from 'assert';

describe('ProjectContext', () => {
  let tempDir: string;
  let projectContext: ProjectContext;

  beforeEach(async () => {
    // Create temporary test directory
    tempDir = path.join(os.tmpdir(), `project-context-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    projectContext = new ProjectContext(tempDir);
  });

  afterEach(async () => {
    // Cleanup temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should initialize with empty structure', () => {
      const structure = projectContext.getStructure();
      assert.strictEqual(structure.root, tempDir);
      assert.strictEqual(structure.files.size, 0);
      assert.strictEqual(structure.dependencies, undefined);
    });
  });

  describe('analyze', () => {
    beforeEach(async () => {
      // Create test file structure
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'console.log("test");');
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
        dependencies: {
          'typescript': '^4.0.0'
        },
        devDependencies: {
          'jest': '^27.0.0'
        }
      }));
    });

    it('should scan directory structure', async () => {
      await projectContext.analyze();
      const structure = projectContext.getStructure();
      
      assert.strictEqual(structure.files.has('src'), true);
      assert.strictEqual(structure.files.has(path.join('src', 'index.ts')), true);
      assert.strictEqual(structure.files.get('src')?.type, 'directory');
      assert.strictEqual(structure.files.get(path.join('src', 'index.ts'))?.type, '.ts');
    });

    it('should parse package.json dependencies', async () => {
      await projectContext.analyze();
      const structure = projectContext.getStructure();
      
      assert.notStrictEqual(structure.dependencies, undefined);
      assert.deepStrictEqual(structure.dependencies, {
        'typescript': '^4.0.0',
        'jest': '^27.0.0'
      });
    });

    it('should handle missing package.json', async () => {
      await fs.unlink(path.join(tempDir, 'package.json'));
      await projectContext.analyze();
      const structure = projectContext.getStructure();
      
      assert.strictEqual(structure.dependencies, undefined);
    });
  });

  describe('updateContext', () => {
    it('should handle file creation', async () => {
      const changes: FileChange[] = [{
        filePath: 'test.ts',
        type: 'created',
        content: 'console.log("test");'
      }];

      const content = changes[0].content ?? '';
      await fs.writeFile(path.join(tempDir, 'test.ts'), content);
      await projectContext.updateContext(changes);
      
      const structure = projectContext.getStructure();
      assert.strictEqual(structure.files.has('test.ts'), true);
      assert.strictEqual(structure.files.get('test.ts')?.type, '.ts');
    });

    it('should handle file modification', async () => {
      // Create initial file
      await fs.writeFile(path.join(tempDir, 'test.ts'), 'initial content');
      await projectContext.analyze();
      
      const initialModified = projectContext.getStructure().files.get('test.ts')?.lastModified;
      
      // Modify file
      const changes: FileChange[] = [{
        filePath: 'test.ts',
        type: 'modified',
        content: 'modified content'
      }];
      
      const content = changes[0].content ?? '';
      await fs.writeFile(path.join(tempDir, 'test.ts'), content);
      await projectContext.updateContext(changes);
      
      const structure = projectContext.getStructure();
      const currentModified = structure.files.get('test.ts')?.lastModified.getTime();
      assert.notStrictEqual(currentModified, undefined);
      assert.ok(currentModified! > initialModified!.getTime());
    });

    it('should handle file deletion', async () => {
      // Create initial file
      await fs.writeFile(path.join(tempDir, 'test.ts'), 'test content');
      await projectContext.analyze();
      
      // Delete file
      await fs.unlink(path.join(tempDir, 'test.ts'));
      await projectContext.updateContext([{
        filePath: 'test.ts',
        type: 'deleted'
      }]);
      
      const structure = projectContext.getStructure();
      assert.strictEqual(structure.files.has('test.ts'), false);
    });

    it('should update dependencies when package.json changes', async () => {
      const changes: FileChange[] = [{
        filePath: 'package.json',
        type: 'modified',
        content: JSON.stringify({
          dependencies: {
            'typescript': '^4.1.0'
          },
          devDependencies: {
            'jest': '^27.1.0'
          }
        })
      }];

      const content = changes[0].content ?? '';
      await fs.writeFile(path.join(tempDir, 'package.json'), content);
      await projectContext.updateContext(changes);
      
      const structure = projectContext.getStructure();
      assert.notStrictEqual(structure.dependencies, undefined);
      assert.deepStrictEqual(structure.dependencies, {
        'typescript': '^4.1.0',
        'jest': '^27.1.0'
      });
    });
  });
});
