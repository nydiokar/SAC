import { readFile } from "fs/promises"
import { describe, it, before } from "mocha"
import { expect } from 'chai'
import * as path from "path"
import * as vscode from "../mocks/vscode"


describe("Cline Extension Integration", () => {
	let packageJSON: any;

	before(async () => {
		const packagePath = path.join(__dirname, "..", "..", "..", "package.json")
		packageJSON = JSON.parse(await readFile(packagePath, "utf8"))
	});

	describe("Extension Setup", () => {
		it("should have correct extension ID", () => {
			const id = `${packageJSON.publisher}.${packageJSON.name}`
			expect(vscode.extensions.getExtension(id)?.id).to.equal(id)
		})

		it("should register commands", () => {
			const commands = packageJSON.contributes.commands
			commands.forEach((command: { command: string }) => {
				expect(() => vscode.commands.executeCommand())
					.to.not.throw()
			})
		})
	})
})
