import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface OperationPattern {
  id?: number;
  pattern: string;
  context: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class LocalStore {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.ensureDirectoryExists(path.dirname(dbPath));
    this.db = new Database(dbPath);
    this.init();
  }

  private ensureDirectoryExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public init(): void {
    // Create the operation_patterns table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operation_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL,
        context TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pattern ON operation_patterns(pattern);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON operation_patterns(timestamp);
    `);
  }

  public storePattern(pattern: Omit<OperationPattern, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO operation_patterns (pattern, context, timestamp, metadata)
      VALUES (@pattern, @context, @timestamp, @metadata)
    `);

    const result = stmt.run({
      pattern: pattern.pattern,
      context: pattern.context,
      timestamp: pattern.timestamp,
      metadata: pattern.metadata ? JSON.stringify(pattern.metadata) : null
    });

    return result.lastInsertRowid as number;
  }

  public findSimilarPattern(pattern: string, contextHint?: string): OperationPattern | null {
    let query = `
      SELECT id, pattern, context, timestamp, metadata
      FROM operation_patterns
      WHERE pattern LIKE @pattern
    `;

    const params: any = {
      pattern: `%${pattern}%`
    };

    if (contextHint) {
      query += ` AND context LIKE @context`;
      params.context = `%${contextHint}%`;
    }

    query += ` ORDER BY timestamp DESC LIMIT 1`;

    const stmt = this.db.prepare(query);
    const result = stmt.get(params) as {
      id: number;
      pattern: string;
      context: string;
      timestamp: number;
      metadata: string | null;
    } | undefined;

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      pattern: result.pattern,
      context: result.context,
      timestamp: result.timestamp,
      metadata: result.metadata ? JSON.parse(result.metadata) : undefined
    };
  }

  public close(): void {
    this.db.close();
  }
}
