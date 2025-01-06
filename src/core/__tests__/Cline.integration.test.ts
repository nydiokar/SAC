import { describe, it, beforeEach, afterEach } from "mocha"
import * as sinon from 'sinon'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { ProjectContext, FileChange } from '../../services/project-context/ProjectContext'
import { expect } from 'chai'

describe("ProjectContext File Operations", () => {
    let sandbox: sinon.SinonSandbox
    let tempDir: string
    let projectContext: ProjectContext

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        tempDir = path.join(os.tmpdir(), "project-context-test-" + Math.random().toString(36).slice(2))
        await fs.mkdir(tempDir, { recursive: true })
        projectContext = new ProjectContext(tempDir)
    })

    afterEach(async () => {
        sandbox.restore()
        await fs.rm(tempDir, { recursive: true, force: true })
    })

    it("should track file creation", async () => {
        const change: FileChange = {
            filePath: 'test.txt',
            type: 'created',
            content: 'test content'
        }

        // Write the actual file
        await fs.writeFile(path.join(tempDir, change.filePath), change.content!)
        
        // Update context
        await projectContext.updateContext([change])

        // Verify structure was updated
        const structure = projectContext.getStructure()
        expect(structure.files.has('test.txt')).to.be.true
        expect(structure.files.get('test.txt')?.type).to.equal('.txt')
    })

    it("should track package.json dependencies", async () => {
        const packageJson = {
            dependencies: {
                "typescript": "^4.0.0"
            },
            devDependencies: {
                "mocha": "^8.0.0"
            }
        }

        const change: FileChange = {
            filePath: 'package.json',
            type: 'created',
            content: JSON.stringify(packageJson)
        }

        // Write the actual file
        await fs.writeFile(path.join(tempDir, change.filePath), change.content!)
        
        // Update context
        await projectContext.updateContext([change])

        // Verify dependencies were tracked
        const structure = projectContext.getStructure()
        expect(structure.dependencies).to.deep.equal({
            "typescript": "^4.0.0",
            "mocha": "^8.0.0"
        })
    })

    it("should handle file deletion", async () => {
        // First create a file
        const filePath = 'to-delete.txt'
        await fs.writeFile(path.join(tempDir, filePath), 'content')
        await projectContext.updateContext([{
            filePath,
            type: 'created',
            content: 'content'
        }])

        // Then delete it
        await fs.unlink(path.join(tempDir, filePath))
        await projectContext.updateContext([{
            filePath,
            type: 'deleted'
        }])

        // Verify it's gone from structure
        const structure = projectContext.getStructure()
        expect(structure.files.has(filePath)).to.be.false
    })
})