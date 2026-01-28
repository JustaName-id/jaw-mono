import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkStringify from 'remark-stringify'
import { toMarkdown } from 'mdast-util-to-markdown'
import { mdxToMarkdown } from 'mdast-util-mdx'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { visit } from 'unist-util-visit'
import type { Heading } from 'mdast'

const DOCS_ROOT = join(import.meta.dirname, '../docs')
const PAGES_DIR = join(DOCS_ROOT, 'pages')
const DIST_DIR = join(DOCS_ROOT, 'dist')

const BASE_URL = 'https://jaw.id/docs'

// Domain configuration
const DOMAINS = {
  wagmi: {
    title: 'JAW Wagmi Integration',
    description: 'Wagmi connector and React hooks for integrating JAW smart accounts into React/Next.js applications.',
    dirs: ['wagmi'],
    includes: [],
  },
  core: {
    title: 'JAW Provider - RPC Reference',
    description: 'EIP-1193 compliant provider with full RPC method support for smart account operations.',
    dirs: ['api-reference'],
    includes: [],
  },
  account: {
    title: 'JAW Account API',
    description: 'Direct smart account operations including signing, transactions, and permission management.',
    dirs: ['account'],
    includes: [],
  },
  'getting-started': {
    title: 'JAW Getting Started',
    description: 'Setup, configuration, and guides for integrating JAW smart accounts.',
    dirs: ['configuration', 'guides', 'advanced'],
    includes: ['index.mdx', 'supported-networks.mdx'],
  },
}

function getAllMdxFiles(dir: string): string[] {
  const files: string[] = []

  if (!existsSync(dir)) return files

  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...getAllMdxFiles(fullPath))
    } else if (entry.endsWith('.mdx') || entry.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  return files
}

function parseMdxFile(filePath: string): { title: string; content: string } {
  const raw = readFileSync(filePath, 'utf-8')

  const parser = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkStringify)

  const ast = parser.parse(raw)

  // Extract title from first H1
  let title = basename(filePath, '.mdx')
  visit(ast, { type: 'heading', depth: 1 }, (node: Heading) => {
    const textNode = node.children[0]
    if (textNode && textNode.type === 'text') {
      title = textNode.value
    }
  })

  // Shift all headings down by 1 level for context files
  visit(ast, (n) => n.type === 'heading', (n) => {
    const node = n as Heading
    if (node.depth >= 1 && node.depth <= 4) {
      node.depth = (node.depth + 1) as 2 | 3 | 4 | 5
    }
  })

  // Remove frontmatter
  visit(ast, { type: 'yaml' }, (_, i, p) => {
    if (p && typeof i === 'number') {
      p.children.splice(i, 1)
    }
  })

  const content = toMarkdown(ast, {
    extensions: [gfmToMarkdown(), mdxToMarkdown()],
  })

  return { title, content }
}

function generateDomainFile(domainKey: string, domain: typeof DOMAINS[keyof typeof DOMAINS]): string {
  const lines: string[] = [
    `# ${domain.title}`,
    '',
    `> ${domain.description}`,
    '',
  ]

  // Collect all files for this domain
  const files: string[] = []

  // Add files from specified directories
  for (const dir of domain.dirs) {
    const dirPath = join(PAGES_DIR, dir)
    files.push(...getAllMdxFiles(dirPath))
  }

  // Add specific included files
  for (const include of domain.includes) {
    const filePath = join(PAGES_DIR, include)
    if (existsSync(filePath)) {
      files.push(filePath)
    }
  }

  // Sort files for consistent output
  files.sort()

  // Process each file
  for (const file of files) {
    try {
      const { title, content } = parseMdxFile(file)
      const relativePath = file.replace(PAGES_DIR, '').replace(/\.(mdx|md)$/, '')

      lines.push(`## ${title}`)
      lines.push(`Source: ${BASE_URL}${relativePath}`)
      lines.push('')
      lines.push(content)
      lines.push('')
    } catch (e) {
      console.error(`Error processing ${file}:`, e)
    }
  }

  return lines.join('\n')
}

function generateRoutingIndex(): string {
  return `# JAW Documentation

> Smart account wallet infrastructure with passkey authentication for blockchain applications.

JAW provides an EIP-1193 compliant provider for interacting with smart accounts, supporting both cross-platform (popup) and app-specific (embedded) authentication via passkeys.

## Instructions

This file is a routing index. To help users with JAW, you MUST:
1. Read the routing table below to identify which integration the user needs.
2. Fetch exactly ONE context file — the single best match for the user's question.

Do NOT attempt to answer using only this file — it does not contain implementation details.
Do NOT fetch all files — each file is self-contained, so only one is needed.

## Routing

If the user is building a **React/Next.js app with Wagmi** (connectors, hooks, standard dApp integration):
→ ${BASE_URL}/llms-wagmi.txt

If the user wants **provider-level control** (EIP-1193 provider, RPC methods, custom provider handling):
→ ${BASE_URL}/llms-core.txt

If the user wants to **embed specific account functionality** (direct account operations, signing, transactions, permissions):
→ ${BASE_URL}/llms-account.txt

If the user needs help with **setup, configuration, or getting started**:
→ ${BASE_URL}/llms-getting-started.txt

## About JAW Packages

- **@jaw.id/wagmi**: Wagmi connector and React hooks for standard dApp integration. Best for React/Next.js apps already using Wagmi.
- **@jaw.id/core**: EIP-1193 compliant provider with full RPC method support. Best for custom provider implementations or non-React apps.
- **Account API**: Direct smart account operations including factory methods, signing, transactions, and permission management. Best for embedding specific functionality.
`
}

async function main() {
  console.log('Generating custom llms.txt files...')

  // Generate domain-specific files
  for (const [key, domain] of Object.entries(DOMAINS)) {
    const content = generateDomainFile(key, domain)
    const outputPath = join(DIST_DIR, `llms-${key}.txt`)
    writeFileSync(outputPath, content)
    console.log(`  Generated: llms-${key}.txt`)
  }

  // Generate routing index (overwrites Vocs-generated llms.txt)
  const routingIndex = generateRoutingIndex()
  writeFileSync(join(DIST_DIR, 'llms.txt'), routingIndex)
  console.log('  Generated: llms.txt (routing index)')

  console.log('Done!')
}

main().catch(console.error)