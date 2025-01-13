import { GlobalFileNames } from "../../core/webview/ClineProvider";

import path from "path";
import { LocalStore } from "../storage/LocalStore";
import { LogPatternExtractor } from "./LogPatternExtractor_old";
import fs from "fs/promises";

export class PatternService {
    private processingTasks: Set<string> = new Set();

    constructor(
        private localStore: LocalStore,
        private logExtractor: LogPatternExtractor,
    ) {}

    async processTaskLogs(taskId: string, globalStoragePath: string): Promise<void> {
        // Prevent duplicate processing
        if (this.processingTasks.has(taskId)) {
            return;
        }

        this.processingTasks.add(taskId);
        try {
            const taskDir = path.join(globalStoragePath, "tasks", taskId);
            const messagesPath = path.join(taskDir, GlobalFileNames.uiMessages);
            
            const messages = await fs.readFile(messagesPath, 'utf8');
            const parsedMessages = JSON.parse(messages);
            
            await this.logExtractor.extractPatterns(parsedMessages);
        } catch (error) {
            console.warn(`Failed to process logs for task ${taskId}:`, error);
        } finally {
            this.processingTasks.delete(taskId);
        }
    }

    async processPendingTasks(globalStoragePath: string): Promise<void> {
        const tasksDir = path.join(globalStoragePath, "tasks");
        
        try {
            const taskDirs = await fs.readdir(tasksDir);
            // Process tasks in parallel but with a limit
            await Promise.all(
                taskDirs.map(taskId => 
                    this.processTaskLogs(taskId, globalStoragePath)
                        .catch(err => console.error(`Failed to process task ${taskId}:`, err))
                )
            );
        } catch (error) {
            console.error('Failed to process pending tasks:', error);
        }
    }
} 