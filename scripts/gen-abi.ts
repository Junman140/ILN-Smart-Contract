
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path to Rust contract
const CONTRACT_PATH = path.join(
  __dirname,
  "../contracts/invoice_liquidity/src/lib.rs"
)

// Output file
const OUTPUT_PATH = path.join(__dirname, "../docs/contract-abi.md")

const source = fs.readFileSync(CONTRACT_PATH, "utf8")

function extractFunctions(code: string) {
  const functionRegex =
    /(?:\/\/\/\s*(.*?)\n)?\s*pub fn (\w+)\((.*?)\)\s*->\s*([^{\s]+)/g

  const functions: any[] = []

  let match
  while ((match = functionRegex.exec(code)) !== null) {
    const [, doc, name, params, returnType] = match

    functions.push({
      name,
      params: params.trim(),
      returnType: returnType.trim(),
      description: doc || "No description",
    })
  }

  return functions
}

function extractErrors(code: string) {
  const enumRegex = /enum ContractError\s*{([\s\S]*?)}/m

  const match = code.match(enumRegex)
  if (!match) return []

  return match[1]
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
}

function generateMarkdown(functions: any[], errors: string[]) {
  let md = `# Contract ABI Documentation\n\n`

  md += `## Functions\n\n`
  md += `| Function | Parameters | Returns | Description |\n`
  md += `|----------|------------|---------|-------------|\n`

  for (const fn of functions) {
    md += `| ${fn.name} | ${fn.params} | ${fn.returnType} | ${fn.description} |\n`
  }

  md += `\n---\n\n`
  md += `## Contract Errors\n\n`

  for (const err of errors) {
    md += `- ${err}\n`
  }

  return md
}

function main() {
  const functions = extractFunctions(source)
  const errors = extractErrors(source)

  const markdown = generateMarkdown(functions, errors)

  fs.writeFileSync(OUTPUT_PATH, markdown)

  console.log("✅ ABI generated at docs/contract-abi.md")
}

main()