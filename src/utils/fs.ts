import fs from "fs/promises"
import * as path from "path"
import { ProjectContext } from "../services/project-context/ProjectContext"

/**
 * Asynchronously creates all non-existing subdirectories for a given file path
 * and collects them in an array for later deletion.
 *
 * @param filePath - The full path to a file.
 * @param projectContext - Optional ProjectContext for structure validation
 * @returns A promise that resolves to an array of newly created directories.
 * @throws Error if validation fails
 */
export async function createDirectoriesForFile(
	filePath: string, 
	projectContext?: ProjectContext
): Promise<string[]> {
	const newDirectories: string[] = []
	const normalizedFilePath = path.normalize(filePath)
	const directoryPath = path.dirname(normalizedFilePath)

	// Validate the directory creation if ProjectContext is provided
	if (projectContext) {
		const validationResult = await projectContext.validateStructure(directoryPath, 'create')
		if (!validationResult.isValid) {
			throw new Error(`Directory creation validation failed: ${validationResult.reason}`)
		}
	}

	let currentPath = directoryPath
	const dirsToCreate: string[] = []

	while (!(await fileExistsAtPath(currentPath))) {
		// Validate each subdirectory if ProjectContext is provided
		if (projectContext) {
			const validationResult = await projectContext.validateStructure(currentPath, 'create')
			if (!validationResult.isValid) {
				throw new Error(`Subdirectory creation validation failed: ${validationResult.reason}`)
			}
		}
		
		dirsToCreate.push(currentPath)
		currentPath = path.dirname(currentPath)
	}

	for (let i = dirsToCreate.length - 1; i >= 0; i--) {
		await fs.mkdir(dirsToCreate[i])
		newDirectories.push(dirsToCreate[i])
	}

	return newDirectories
}

/**
 * Helper function to check if a path exists.
 *
 * @param path - The path to check.
 * @returns A promise that resolves to true if the path exists, false otherwise.
 */
export async function fileExistsAtPath(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

/**
 * Writes content to a file after validating the operation
 * 
 * @param filePath - The path to write to
 * @param content - The content to write
 * @param projectContext - Optional ProjectContext for structure validation
 * @throws Error if validation fails
 */
export async function writeFileWithValidation(
	filePath: string, 
	content: string | Buffer,
	projectContext?: ProjectContext
): Promise<void> {
	if (projectContext) {
		const validationResult = await projectContext.validateStructure(filePath, 'create')
		if (!validationResult.isValid) {
			throw new Error(`File write validation failed: ${validationResult.reason}`)
		}
	}

	await fs.writeFile(filePath, content)
}

/**
 * Reads a file after validating the operation
 * 
 * @param filePath - The path to read from
 * @param projectContext - Optional ProjectContext for structure validation
 * @returns The file content
 * @throws Error if validation fails
 */
export async function readFileWithValidation(
	filePath: string,
	projectContext?: ProjectContext
): Promise<Buffer> {
	if (projectContext) {
		const validationResult = await projectContext.validateStructure(filePath, 'read')
		if (!validationResult.isValid) {
			throw new Error(`File read validation failed: ${validationResult.reason}`)
		}
	}

	return fs.readFile(filePath)
}

/**
 * Deletes a file or directory after validating the operation
 * 
 * @param path - The path to delete
 * @param projectContext - Optional ProjectContext for structure validation
 * @throws Error if validation fails
 */
export async function deleteWithValidation(
	filePath: string,
	projectContext?: ProjectContext
): Promise<void> {
	if (projectContext) {
		const validationResult = await projectContext.validateStructure(filePath, 'delete')
		if (!validationResult.isValid) {
			throw new Error(`Delete operation validation failed: ${validationResult.reason}`)
		}
	}

	const stats = await fs.stat(filePath)
	if (stats.isDirectory()) {
		await fs.rmdir(filePath, { recursive: true })
	} else {
		await fs.unlink(filePath)
	}
}
