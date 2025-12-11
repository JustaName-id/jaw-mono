import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'

export const metadata = {
  title: 'JAW Core Documentation',
  description: 'Official documentation for @jaw.id/core package',
}

const navbar = (
  <Navbar
    logo={<span style={{ fontWeight: 'bold' }}>JAW</span>}
    projectLink="https://github.com/JustaName-id/jaw-mono"
  />
)

const footer = (
  <Footer>
      {new Date().getFullYear()} © JAW
  </Footer>
)

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/JustaName-id/jaw-mono/tree/main/apps/docs"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}