import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';

export interface OperationPattern {
  id?: number;
  pattern: string;
  context: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PatternRow {
  id: number;
  pattern: string;
  context: string;
  timestamp: number;
  metadata: string | null;
}

export class LocalStore {
  private db: DatabaseType;
  private storeStmt!: Statement;
  private findExactStmt!: Statement;
  private findSimilarStmt!: Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    
    // Additional performance optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 2000');  // Increased cache size
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000');
    
    this.initialize();
    this.prepareStatements();
  }

  private initialize() {
    // Wrap table creation in transaction for better performance
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pattern TEXT NOT NULL,
          context TEXT NOT NULL,
          command TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          metadata TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_command_context ON patterns(command, context);
        CREATE INDEX IF NOT EXISTS idx_context_timestamp ON patterns(context, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_command_timestamp ON patterns(command, timestamp DESC);
      `);
    })();
  }

  private prepareStatements() {
    // Prepare statements once for reuse
    this.storeStmt = this.db.prepare(`
      INSERT INTO patterns (pattern, context, command, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.findExactStmt = this.db.prepare(`
      SELECT * FROM patterns 
      WHERE command = ? AND context = ?
      ORDER BY timestamp DESC
      LIMIT 5
    `);

    this.findSimilarStmt = this.db.prepare(`
      SELECT * FROM patterns 
      WHERE command = ? 
      ORDER BY timestamp DESC
      LIMIT 10
    `);
  }

  public storePattern(pattern: Omit<OperationPattern, 'id'>): number {
    const command = pattern.pattern.split(' ')[0].toLowerCase();
    
    const metadata = pattern.metadata ? JSON.stringify(pattern.metadata) : null;
    
    const result = this.storeStmt.run(
      pattern.pattern.trim(),
      pattern.context,
      command,
      pattern.timestamp,
      metadata
    );

    return result.lastInsertRowid as number;
  }

  public findSimilarPattern(pattern: string, context?: string): OperationPattern | null {
    const command = pattern.split(' ')[0].toLowerCase();
    
    // If context is provided, use LIKE for partial context matching
    if (context) {
        const contextMatches = this.db.prepare(`
            SELECT * FROM patterns 
            WHERE command = ? AND context LIKE ?
            ORDER BY timestamp DESC
            LIMIT 5
        `).all(command, `%${context}%`) as PatternRow[];
        
        if (contextMatches.length > 0) {
            const bestMatch = this.findBestMatch(pattern, contextMatches);
            if (bestMatch) return this.convertRowToPattern(bestMatch.row);
        }
        return null;
    }

    // Use existing findSimilarStmt for non-context searches
    const similarMatches = this.findSimilarStmt.all(command) as PatternRow[];
    if (similarMatches.length === 0) return null;

    const bestMatch = this.findBestMatch(pattern, similarMatches);
    if (!bestMatch) return null;

    return this.convertRowToPattern(bestMatch.row);
  }

  private findBestMatch(pattern: string, rows: PatternRow[]) {
    if (rows.length === 0) return null;

    // For security/auth and styling patterns, check metadata
    for (const row of rows) {
        try {
            const metadata = JSON.parse(row.metadata || '{}');
            const metadataScore = this.calculateMetadataSimilarity(pattern, metadata);
            
            // If we have a strong metadata match, return it immediately
            if (metadataScore > 0.5) {
                return { row, score: metadataScore };
            }
        } catch {
            continue;
        }
    }

    // Fall back to regular similarity matching
    const similarity = this.calculatePatternSimilarity(pattern, rows[0].pattern);
    return similarity >= 0.3 ? { row: rows[0], score: similarity } : null;
  }
  
  private convertRowToPattern(row: PatternRow): OperationPattern {
    let metadata: Record<string, any> | undefined;
    
    try {
        // More robust metadata parsing
        metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
        
        // Ensure metadata is an object
        if (metadata && typeof metadata !== 'object') {
            metadata = { value: metadata };
        }
    } catch (e) {
        console.warn('Failed to parse metadata:', e);
        metadata = undefined;
    }

    return {
        id: row.id,
        pattern: row.pattern,
        context: row.context,
        timestamp: row.timestamp,
        metadata
    };
  }

  private calculatePatternSimilarity(pattern1: string, pattern2: string): number {
    const words1 = pattern1.toLowerCase().split(/\s+/);
    const words2 = pattern2.toLowerCase().split(/\s+/);
    
    let score = 0;
    const maxScore = Math.max(words1.length, words2.length);
    
    // Match exact words in any position
    words1.forEach(word => {
        if (words2.includes(word)) {
            score += 1;
        }
    });

    // Bonus for matching first word (command)
    if (words1[0] === words2[0]) {
        score += 0.5;
    }

    // Bonus for matching length
    if (words1.length === words2.length) {
        score += 0.5;
    }

    return score / maxScore;
  }

  private calculateMetadataSimilarity(pattern: string, metadata: Record<string, any>): number {
    let score = 0;
    const patternLower = pattern.toLowerCase();

    // Check each metadata value for matches
    for (const [key, value] of Object.entries(metadata)) {
        const valueStr = String(value).toLowerCase();
        
        // Direct matches in pattern
        if (patternLower.includes(valueStr)) {
            score += 0.4;  // Increased score for direct matches
        }

        // Partial matches
        if (patternLower.includes(key.toLowerCase())) {
            score += 0.2;
        }

        // Special handling for styling-related terms
        if (key === 'styling' && 
            (patternLower.includes('style') || 
             patternLower.includes('styled') ||
             patternLower.includes('css'))) {
            score += 0.6;  // Increased score for styling matches
        }

        // Special handling for security-related terms
        if (key === 'security' && 
            (patternLower.includes('secure') || 
             patternLower.includes('auth') ||
             patternLower.includes('authentication'))) {
            score += 0.6;  // Increased score for security matches
        }
    }

    return Math.min(score, 1);  // Normalize score to max of 1
  }

  public findAllPatterns(pattern: string): OperationPattern[] {
    const stmt = this.db.prepare(`
      SELECT * FROM patterns 
      WHERE pattern LIKE ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(`%${pattern.trim()}%`) as PatternRow[];
    return rows.map(row => ({
      id: row.id,
      pattern: row.pattern,
      context: row.context,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  public close() {
    this.db.close();
  }

  // Add method for bulk operations
  public bulkStore(patterns: Omit<OperationPattern, 'id'>[]): number[] {
    const ids: number[] = [];
    
    const transaction = this.db.transaction((patterns: Omit<OperationPattern, 'id'>[]) => {
      for (const pattern of patterns) {
        const command = pattern.pattern.split(' ')[0].toLowerCase();
        const result = this.storeStmt.run(
          pattern.pattern.trim(),
          pattern.context,
          command,
          pattern.timestamp,
          pattern.metadata ? JSON.stringify(pattern.metadata) : null
        );
        ids.push(result.lastInsertRowid as number);
      }
    });

    transaction(patterns);
    return ids;
  }
}
