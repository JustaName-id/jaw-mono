import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: 'JAW Core Documentation',
  description: 'Official documentation for @jaw.id/core package',
}

const navbar = (
  <Navbar
    logo={<span style={{ fontWeight: 'bold' }}>JAW Accounts</span>}
    projectLink="https://github.com/JustaName-id/accounts"
  />
)

const footer = (
  <Footer>
    MIT {new Date().getFullYear()} © JAW Accounts
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
          docsRepositoryBase="https://github.com/JustaName-id/accounts/tree/main/apps/docs"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}