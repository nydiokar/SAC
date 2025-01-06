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
    // Get all patterns for the context
    let query = `
      SELECT id, pattern, context, timestamp, metadata
      FROM operation_patterns
      WHERE 1=1
    `;

    const params: any = {};

    if (contextHint) {
      query += ` AND context LIKE @context`;
      params.context = `%${contextHint}%`;
    }

    const stmt = this.db.prepare(query);
    const patterns = stmt.all(params) as Array<{
      id: number;
      pattern: string;
      context: string;
      timestamp: number;
      metadata: string | null;
    }>;

    // Find best match using word similarity
    let bestMatch = null;
    let highestSimilarity = 0;

    const patternWords = new Set(pattern.toLowerCase().split(/\s+/));

    for (const p of patterns) {
      const currentWords = new Set(p.pattern.toLowerCase().split(/\s+/));
      const intersection = new Set([...patternWords].filter(x => currentWords.has(x)));
      const similarity = intersection.size / Math.max(patternWords.size, currentWords.size);

      if (similarity > highestSimilarity && similarity >= 0.5) { // Lower threshold to 0.5
        highestSimilarity = similarity;
        bestMatch = p;
      }
    }

    if (!bestMatch) {
        return null;
    }

    return {
      id: bestMatch.id,
      pattern: bestMatch.pattern,
      context: bestMatch.context,
      timestamp: bestMatch.timestamp,
      metadata: bestMatch.metadata ? JSON.parse(bestMatch.metadata) : undefined
    };
  }

  public findAllPatterns(pattern: string): OperationPattern[] {
    const stmt = this.db.prepare(`
      SELECT id, pattern, context, timestamp, metadata
      FROM operation_patterns
      WHERE pattern = @pattern
      ORDER BY timestamp DESC
    `);

    const patterns = stmt.all({ pattern }) as Array<{
      id: number;
      pattern: string;
      context: string;
      timestamp: number;
      metadata: string | null;
    }>;

    return patterns.map(p => ({
      id: p.id,
      pattern: p.pattern,
      context: p.context,
      timestamp: p.timestamp,
      metadata: p.metadata ? JSON.parse(p.metadata) : undefined
    }));
  }

  public async close(): Promise<void> {
    this.db.close();
  }
}
