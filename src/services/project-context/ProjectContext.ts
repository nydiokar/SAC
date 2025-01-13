import * as path from 'path';
import { promises as fs } from 'fs';
import { workspace, RelativePattern } from 'vscode';
import { Minimatch } from 'minimatch';
import { LocalStore, OperationPattern } from '../storage/LocalStore';

/**
 * Represents a change in a file within the project
 */
export interface FileChange {
  /**
   * The path to the file that changed, relative to project root
   */
  filePath: string;
  /**
   * The type of change that occurred
   */
  type: 'created' | 'modified' | 'deleted' | 'read';
  /**
   * Optional new content of the file
   */
  content?: string;
}

/**
 * Represents the structure and state of a project
 */
export interface ProjectStructure {
  /**
   * Root directory of the project
   */
  root: string;
  /**
   * Map of file paths to their last known state
   */
  files: Map<string, {
    lastModified: Date;
    type: string; // file extension or 'directory'
  }>;
  /**
   * Dependencies found in package files
   */
  dependencies?: {
    [key: string]: string;
  };
}

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

interface ValidationRule {
  pattern: string;
  isAllowed: boolean;
  description: string;
}

/**
 * Manages project context and analysis
 */
export class ProjectContext {
  private structure: ProjectStructure;
  private readonly defaultRestrictions: ValidationRule[] = [
    { pattern: 'node_modules/**', isAllowed: false, description: 'Restricted system directory' },
    { pattern: '.env*', isAllowed: false, description: 'Sensitive environment files' },
    { pattern: '.git/**', isAllowed: false, description: 'Git system directory' },
    { pattern: '**/*.{ts,js,json,md,txt,yml,yaml}', isAllowed: true, description: 'Common project files' }
  ];
  private fileChangesHistory: FileChange[] = [];

  constructor(
    private workspacePath: string, 
    private localStore?: LocalStore,
    private isTestEnvironment: boolean = false
  ) {
    this.structure = {
      root: workspacePath,
      files: new Map()
    };
  }

  async initialize(): Promise<void> {
    try {
        // Initialize the project structure
        this.structure = {
            root: this.workspacePath,
            files: new Map()
        };

        // Perform initial project analysis
        await this.analyze();

        // Only set up file watchers if we're not in test environment
        if (!this.isTestEnvironment) {
            const watcher = workspace.createFileSystemWatcher(
                new RelativePattern(this.workspacePath, '**/*')
            );

            // Handle file changes
            watcher.onDidChange(async uri => {
                await this.updateContext([{
                    filePath: path.relative(this.workspacePath, uri.fsPath),
                    type: 'modified'
                }]);
            });

        watcher.onDidCreate(async uri => {
            await this.updateContext([{
                filePath: path.relative(this.workspacePath, uri.fsPath),
                type: 'created'
            }]);
        });

            watcher.onDidDelete(async uri => {
                await this.updateContext([{
                    filePath: path.relative(this.workspacePath, uri.fsPath),
                    type: 'deleted'
                }]);
            });
        }

    } catch (error) {
        console.error('Failed to initialize project context:', error);
        throw error;
    }
  }

  /**
   * Analyzes the project structure and builds initial context
   */
  public async analyze(): Promise<void> {
    try {
      // Read project directory recursively
      await this.scanDirectory(this.structure.root);

      // Try to parse package.json if it exists
      const packageJsonPath = path.join(this.structure.root, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        this.structure.dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };
      } catch (err) {
        // package.json not found or invalid - skip dependencies
      }
    } catch (err) {
      throw new Error(`Failed to analyze project: ${err.message}`);
    }
  }

  /**
   * Updates project context based on file changes
   */
  public async updateContext(changes: FileChange[]): Promise<void> {
    // Store changes in history
    this.fileChangesHistory.push(...changes);
    
    for (const change of changes) {
      const absolutePath = path.join(this.structure.root, change.filePath);
      
      switch (change.type) {
        case 'created':
        case 'modified':
        case 'read':
          const stats = await fs.stat(absolutePath);
          this.structure.files.set(change.filePath, {
            lastModified: stats.mtime,
            type: path.extname(change.filePath) || 'directory'
          });
          
          // Update dependencies if package.json changed
          if (change.filePath === 'package.json' && change.content) {
            try {
              const packageJson = JSON.parse(change.content);
              this.structure.dependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
              };
            } catch (err) {
              // Invalid package.json content - skip update
            }
          }
          break;

        case 'deleted':
          this.structure.files.delete(change.filePath);
          break;
      }
    }
  }

  /**
   * Gets the current project structure
   */
  public getStructure(): ProjectStructure {
    return this.structure;
  }

  /**
   * Gets the current context of the project for pattern matching
   * Returns a string containing relevant project information
   */
  public getCurrentContext(): string {
    const context: string[] = [];
    
    // Add project root
    context.push(`Project root: ${this.structure.root}`);
    
    // Add dependencies if available
    if (this.structure.dependencies && Object.keys(this.structure.dependencies).length > 0) {
      context.push('\nDependencies:');
      Object.entries(this.structure.dependencies)
        .forEach(([dep, version]) => context.push(`${dep}@${version}`));
    }
    
    // Add file types summary
    const fileTypes = new Map<string, number>();
    this.structure.files.forEach((info) => {
      const type = info.type === 'directory' ? 'directory' : info.type || 'unknown';
      fileTypes.set(type, (fileTypes.get(type) || 0) + 1);
    });
    
    context.push('\nFile types:');
    fileTypes.forEach((count, type) => {
      context.push(`${type}: ${count} files`);
    });
    
    return context.join('\n');
  }

  /**
   * Recursively scans a directory and updates the file structure
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.structure.root, fullPath);

      if (entry.isDirectory()) {
        this.structure.files.set(relativePath, {
          lastModified: new Date(),
          type: 'directory'
        });
        await this.scanDirectory(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        this.structure.files.set(relativePath, {
          lastModified: stats.mtime,
          type: path.extname(entry.name) || 'file'
        });
      }
    }
  }

  /**
   * Gets the list of file changes that occurred during the current session
   */
  public getFileChanges(): FileChange[] {
    return [...this.fileChangesHistory]; // Return copy of changes
  }

  /**
   * Validates if a file operation maintains project integrity
   * @param filePath - Relative path to the file
   * @param operation - Type of operation (create, delete, modify, read)
   * @returns ValidationResult indicating if the operation is allowed
   */
  public async validateStructure(
    filePath: string, 
    operation: 'create' | 'delete' | 'modify' | 'read'
  ): Promise<ValidationResult> {
    try {
      const relativePath = path.relative(this.structure.root, filePath);
      
      // Prevent path traversal attacks
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return {
          isValid: false,
          reason: 'Invalid path: Attempted to access outside project directory'
        };
      }

      // Check against default restrictions
      for (const rule of this.defaultRestrictions) {
        const matcher = new Minimatch(rule.pattern, { matchBase: true, dot: true });
        if (matcher.match(relativePath)) {
          if (!rule.isAllowed) {
            return {
              isValid: false,
              reason: rule.description
            };
          }
          break;
        }
      }

      // Check if the operation is valid for the current project state
      const fileExists = this.structure.files.has(relativePath);
      
      if (operation === 'create' && fileExists) {
        return {
          isValid: false,
          reason: 'File already exists'
        };
      }

      if ((operation === 'delete' || operation === 'modify') && !fileExists) {
        return {
          isValid: false,
          reason: 'File does not exist'
        };
      }

      // Store the operation pattern in LocalStore
      const pattern: OperationPattern = {
        pattern: relativePath,
        context: 'workspace',
        timestamp: Date.now(),
        metadata: {
            taskType: operation,
            toolUsage: []
        },
        confidence: 1.0
      };
      
      try {
        await this.localStore?.storePattern(pattern);
      } catch (error) {
        console.warn('Failed to store operation pattern:', error);
        // Don't fail the validation if storage fails
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  public clearFileChanges(): void {
    this.fileChangesHistory = [];
  }
}
