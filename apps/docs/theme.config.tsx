import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>JAW Accounts - Core Package Documentation</span>,
  project: {
    link: 'https://github.com/JustaName-id/jaw-mono',
  },
  docsRepositoryBase: 'https://github.com/JustaName-id/jaw-mono',
  footer: {
    text: 'JAW Accounts Documentation',
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – JAW Core'
    }
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="JAW Core Documentation" />
      <meta property="og:description" content="Documentation for @jaw.id/core package" />
    </>
  ),
}

export default config