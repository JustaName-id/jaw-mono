import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkStringify from 'remark-stringify'
import { toMarkdown } from 'mdast-util-to-markdown'
import { mdxToMarkdown } from 'mdast-util-mdx'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { visit } from 'unist-util-visit'
import type { Heading } from 'mdast'

// Use fileURLToPath for ESM compatibility across environments
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// apps/docs is the root of the docs app
const DOCS_APP_ROOT = join(__dirname, '..')
const PAGES_DIR = join(DOCS_APP_ROOT, 'docs/pages')

// Find the dist directory - Vocs outputs to different locations locally vs Vercel
function findDistDir(): string {
  const candidates = [
    join(DOCS_APP_ROOT, 'docs/dist'),              // Local: Vocs default
    join(DOCS_APP_ROOT, '.vercel/output/static'),  // Vercel: static output
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Dist directory not found. Checked: ${candidates.join(', ')}`)
}

// DIST_DIR is resolved lazily inside main() to ensure vocs build has completed
let DIST_DIR: string

const BASE_URL = 'https://docs.jaw.id'

// Domain configuration with rich headers for LLM discoverability
interface DomainConfig {
  title: string
  description: string
  dirs: string[]
  includes: string[]
  packageName?: string
  installCommand?: string
  quickExample?: string
}

const DOMAINS: Record<string, DomainConfig> = {
  wagmi: {
    title: 'JAW Wagmi Integration',
    description: 'Wagmi connector and React hooks for integrating JAW smart accounts into React/Next.js applications.',
    dirs: ['wagmi'],
    includes: [],
    packageName: '@jaw.id/wagmi',
    installCommand: 'npm install @jaw.id/wagmi wagmi viem @tanstack/react-query',
    quickExample: `import { jaw } from '@jaw.id/wagmi';
import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';

const config = createConfig({
  chains: [base],
  connectors: [
    jaw({
      apiKey: 'YOUR_API_KEY',
      appName: 'My App',
    }),
  ],
  transports: { [base.id]: http() },
});`,
  },
  core: {
    title: 'JAW Provider - RPC Reference',
    description: 'EIP-1193 compliant provider with full RPC method support for smart account operations.',
    dirs: ['api-reference'],
    includes: [],
    packageName: '@jaw.id/core',
    installCommand: 'npm install @jaw.id/core viem',
    quickExample: `import { JAW } from '@jaw.id/core';

const provider = await JAW.create({
  apiKey: 'YOUR_API_KEY',
  appName: 'My App',
  chains: [{ id: 8453, rpcUrl: 'https://mainnet.base.org' }],
});

// EIP-1193 compliant - use with any library
const accounts = await provider.request({ method: 'eth_requestAccounts' });`,
  },
  account: {
    title: 'JAW Account API',
    description: 'Direct smart account operations including signing, transactions, and permission management.',
    dirs: ['account'],
    includes: [],
    packageName: '@jaw.id/core',
    installCommand: 'npm install @jaw.id/core viem',
    quickExample: `import { JAW } from '@jaw.id/core';

const provider = await JAW.create({ apiKey: 'KEY', appName: 'App', chains: [...] });
const account = provider.getAccount();

// Send a transaction
const hash = await account.sendTransaction({
  to: '0x...',
  value: parseEther('0.01'),
});`,
  },
  quickstart: {
    title: 'JAW Quickstart & Guides',
    description: 'Getting started with JAW smart accounts - setup, tutorials, and common use cases.',
    dirs: ['guides'],
    includes: ['index.mdx', 'supported-networks.mdx'],
    packageName: '@jaw.id/wagmi (React) or @jaw.id/core (vanilla JS)',
    installCommand: 'npm install @jaw.id/wagmi wagmi viem @tanstack/react-query',
    quickExample: `// 1. Get API key at https://dashboard.jaw.id
// 2. Install packages
// 3. Configure connector (see full docs below)`,
  },
  configuration: {
    title: 'JAW Configuration Reference',
    description: 'Configuration options for JAW - applies to both core and wagmi integrations.',
    dirs: ['configuration'],
    includes: [],
    packageName: '@jaw.id/wagmi or @jaw.id/core',
    quickExample: `jaw({
  apiKey: 'YOUR_API_KEY',      // Required - from dashboard.jaw.id
  appName: 'My App',           // Required - shown in passkey prompts
  mode: 'crossPlatform',       // Optional - 'crossPlatform' | 'appSpecific'
  paymasterUrl: '...',         // Optional - for gas sponsoring
  ensConfig: { ... },          // Optional - for ENS subnames
})`,
  },
  advanced: {
    title: 'JAW Advanced Topics',
    description: 'Advanced implementation details - custom UI handlers, passkey server setup, and specialized configurations.',
    dirs: ['advanced'],
    includes: [],
    packageName: '@jaw.id/core + @jaw.id/ui',
    installCommand: 'npm install @jaw.id/core @jaw.id/ui viem',
    quickExample: `// App-specific mode with custom UI
import { JAW } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw.id/ui';

const provider = await JAW.create({
  apiKey: 'KEY',
  appName: 'App',
  mode: 'appSpecific',
  uiHandler: new ReactUIHandler(),
  chains: [...],
});`,
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

function generateDomainFile(domainKey: string, domain: DomainConfig): string {
  const lines: string[] = [
    `# ${domain.title}`,
    '',
    `> ${domain.description}`,
    '',
    '**This file is self-contained.** You have everything needed to help with this topic. Do NOT fetch other llms-*.txt files unless the user explicitly asks about a different topic.',
    '',
  ]

  // Add key info section
  lines.push('## Key Info')
  if (domain.packageName) {
    lines.push(`- **Package:** \`${domain.packageName}\``)
  }
  if (domain.installCommand) {
    lines.push(`- **Install:** \`${domain.installCommand}\``)
  }
  lines.push('- **Dashboard:** https://dashboard.jaw.id')
  lines.push('- **Docs:** https://docs.jaw.id')
  lines.push('')

  // Add quick example
  if (domain.quickExample) {
    lines.push('## Quick Example')
    lines.push('```typescript')
    lines.push(domain.quickExample)
    lines.push('```')
    lines.push('')
  }

  lines.push('---')
  lines.push('')

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

## Instructions for AI Assistants

This file is a **routing index only**. To help users with JAW:

1. **Read the routing table below** to identify which file matches the user's question
2. **Fetch exactly ONE file** — the single best match
3. **Answer using that file's content**

**IMPORTANT:**
- Do NOT answer questions using only this routing file — it lacks implementation details
- Do NOT fetch multiple files at once — each domain file is self-contained
- Do NOT guess — if unclear, ask the user what they're trying to build

## Routing Table

| User is asking about... | Fetch this file |
|-------------------------|-----------------|
| React hooks, useConnect, useDisconnect, wagmi connector, Next.js | ${BASE_URL}/llms-wagmi.txt |
| provider.request, EIP-1193, eth_sendTransaction, wallet_sendCalls, non-React apps | ${BASE_URL}/llms-core.txt |
| account.sendTransaction, account.signMessage, direct account operations | ${BASE_URL}/llms-account.txt |
| Getting started, tutorials, SIWE authentication, subscriptions, guides | ${BASE_URL}/llms-quickstart.txt |
| API key setup, paymaster, gasless transactions, ENS subnames, configuration options | ${BASE_URL}/llms-configuration.txt |
| Custom UI, passkey server, app-specific mode, ReactUIHandler, advanced setup | ${BASE_URL}/llms-advanced.txt |

## Decision Flowchart

\`\`\`
Is the user building a React/Next.js app?
├─ YES → Are they using Wagmi?
│        ├─ YES → llms-wagmi.txt
│        └─ NO/UNSURE → llms-wagmi.txt (recommended for React)
└─ NO → Are they building a custom integration?
         ├─ YES → llms-core.txt (EIP-1193 provider)
         └─ UNSURE → llms-quickstart.txt (start here)
\`\`\`

## Package Overview

| Package | Use Case | Install |
|---------|----------|---------|
| \`@jaw.id/wagmi\` | React/Next.js apps with Wagmi | \`npm install @jaw.id/wagmi wagmi viem @tanstack/react-query\` |
| \`@jaw.id/core\` | Non-React or custom provider setups | \`npm install @jaw.id/core viem\` |
| \`@jaw.id/ui\` | Custom UI for app-specific mode | \`npm install @jaw.id/ui\` |

## Quick Links

- **Dashboard (get API key):** https://dashboard.jaw.id
- **Documentation:** https://docs.jaw.id
- **GitHub:** https://github.com/JustaName-id/jaw-mono
`
}

function generateFullTxt(): string {
  return `# JAW Full Documentation

> This file redirects to the routing index for efficient AI assistance.

For the best experience, please fetch the routing index instead:
→ ${BASE_URL}/llms.txt

The routing index will direct you to the specific documentation file you need based on your question. This approach is more efficient than loading all documentation at once.

## Why Use the Router?

1. **Faster responses** - Only loads the documentation relevant to your question
2. **Better context** - Each domain file is self-contained and focused
3. **More accurate** - AI can provide better answers with focused context

## Direct Links (if you know what you need)

- Wagmi/React integration: ${BASE_URL}/llms-wagmi.txt
- Core provider (EIP-1193): ${BASE_URL}/llms-core.txt
- Account API: ${BASE_URL}/llms-account.txt
- Quickstart & guides: ${BASE_URL}/llms-quickstart.txt
- Configuration: ${BASE_URL}/llms-configuration.txt
- Advanced topics: ${BASE_URL}/llms-advanced.txt
`
}

async function main() {
  // Resolve DIST_DIR at runtime (after vocs build has completed)
  DIST_DIR = findDistDir()
  console.log('Generating llms.txt files to:', DIST_DIR)

  // Generate domain-specific files
  for (const [key, domain] of Object.entries(DOMAINS)) {
    const content = generateDomainFile(key, domain)
    const outputPath = join(DIST_DIR, `llms-${key}.txt`)
    writeFileSync(outputPath, content)
    console.log(`  Generated: llms-${key}.txt (${content.length} bytes)`)
  }

  // Generate routing index (overwrites Vocs-generated llms.txt)
  const routingIndex = generateRoutingIndex()
  const llmsPath = join(DIST_DIR, 'llms.txt')
  writeFileSync(llmsPath, routingIndex)
  console.log(`  Generated: llms.txt (routing index, ${routingIndex.length} bytes)`)

  // Verify the file was written correctly
  const written = readFileSync(llmsPath, 'utf-8')
  if (written.includes('# JAW Documentation')) {
    console.log('  Verified: llms.txt contains custom routing index')
  } else {
    console.error('ERROR: llms.txt does not contain expected content')
    console.error('First 100 chars:', written.slice(0, 100))
  }

  // Generate llms-full.txt (redirects to router - some tools look for this file)
  const fullTxt = generateFullTxt()
  const fullPath = join(DIST_DIR, 'llms-full.txt')
  writeFileSync(fullPath, fullTxt)
  console.log(`  Generated: llms-full.txt (redirect, ${fullTxt.length} bytes)`)

  console.log('Done!')
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})