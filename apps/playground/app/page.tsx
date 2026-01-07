import Link from 'next/link';

const routes = [
  {
    href: '/wagmi',
    title: 'Wagmi Integration',
    description:
        'Test @jaw.id/wagmi hooks including connections, signing, transactions, permissions, and wallet capabilities.',
  },
  {
    href: '/core',
    title: 'Core SDK',
    description:
      'Test @jaw.id/core functionality via EIP-1193 provider, including connections, signing, transactions, permissions, and wallet capabilities.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
            JAW SDK Playground
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Interactive examples for testing and exploring the JAW SDK
            integrations.
          </p>
        </div>

        <div className="grid gap-6">
          {routes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="block bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400"
            >
              <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                {route.title}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {route.description}
              </p>
              <span className="inline-block mt-4 text-blue-600 dark:text-blue-400 text-sm font-medium">
                Open {route.href} →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
