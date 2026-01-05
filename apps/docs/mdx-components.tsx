import type { MDXComponents } from 'mdx/types'
import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs'
import { Tabs } from 'nextra/components'
import { Callout } from './src/components/Callout'

const themeComponents = getThemeComponents()

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...themeComponents,
    Callout,
    Tabs,
    ...components,
  }
}