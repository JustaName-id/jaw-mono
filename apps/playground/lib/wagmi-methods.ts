/**
 * Wagmi Methods Registry
 * Maps RPC methods to their wagmi hook implementations
 */

export type MethodCategory =
  | 'account'
  | 'chain'
  | 'transaction'
  | 'signing'
  | 'wallet'
  | 'capability'
  | 'permission'
  | 'asset';

export const CATEGORIES: MethodCategory[] = [
  'account',
  'chain',
  'transaction',
  'signing',
  'wallet',
  'capability',
  'permission',
  'asset',
];

export const CATEGORY_LABELS: Record<MethodCategory, string> = {
  account: 'Account',
  chain: 'Chain',
  transaction: 'Transaction',
  signing: 'Signing',
  wallet: 'Wallet',
  capability: 'Capability',
  permission: 'Permission',
  asset: 'Asset',
};

export const CATEGORY_COLORS: Record<MethodCategory, string> = {
  account: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  chain: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  transaction: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  signing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  wallet: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  capability: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  permission: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  asset: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
};

export type ParameterDefinition = {
  name: string;
  type: 'address' | 'hex' | 'number' | 'string' | 'json' | 'select';
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
  options?: { label: string; value: string }[];
  autoFill?: 'address' | 'chainId';
};

// Hook types for wagmi methods
export type WagmiHookType =
  | 'jawConnect'
  | 'jawDisconnect'
  | 'useSwitchChain'
  | 'useSendTransaction'
  | 'useSignMessage'
  | 'useSignTypedData'
  | 'useSendCalls'
  | 'useCallsStatus'
  | 'useGrantPermissions'
  | 'useRevokePermissions'
  | 'usePermissions'
  | 'useGetAssets'
  | 'useCapabilities';

export type WagmiMethod = {
  id: string;
  name: string;
  method: string;
  hookType: WagmiHookType;
  category: MethodCategory;
  description: string;
  requiresConnection: boolean;
  parameters?: ParameterDefinition[];
  getCodeSnippet: (params: Record<string, string>) => string;
  buildParams: (params: Record<string, string>, context: { address?: string; chainId?: number }) => Record<string, unknown>;
};

export const WAGMI_METHODS: WagmiMethod[] = [
  // ===== Wallet Methods =====
  {
    id: 'jaw_connect',
    name: 'useConnect',
    method: 'wallet_connect',
    hookType: 'jawConnect',
    category: 'wallet',
    description: 'Connect with JAW wallet using wallet_connect',
    requiresConnection: false,
    parameters: [],
    getCodeSnippet: () => `import { useConnect } from '@jaw.id/wagmi';
import { useConnect as useWagmiConnect } from 'wagmi';

const { connectors } = useWagmiConnect();
const { mutate: connect } = useConnect();

const jawConnector = connectors.find(c => c.id === 'jaw');
connect({ connector: jawConnector });`,
    buildParams: () => ({}),
  },
  {
    id: 'jaw_disconnect',
    name: 'useDisconnect',
    method: 'wallet_disconnect',
    hookType: 'jawDisconnect',
    category: 'wallet',
    description: 'Disconnect from JAW wallet',
    requiresConnection: true,
    parameters: [],
    getCodeSnippet: () => `import { useDisconnect } from '@jaw.id/wagmi';
import { useAccount } from 'wagmi';

const { connector } = useAccount();
const { mutate: disconnect } = useDisconnect();

disconnect({ connector });`,
    buildParams: () => ({}),
  },

  // ===== Chain Methods =====
  {
    id: 'wallet_switchChain',
    name: 'useSwitchChain',
    method: 'wallet_switchEthereumChain',
    hookType: 'useSwitchChain',
    category: 'chain',
    description: 'Switch to a different chain',
    requiresConnection: true,
    parameters: [
      {
        name: 'chainId',
        type: 'select',
        label: 'Target Chain',
        required: true,
        defaultValue: '1',
        options: [
          { label: 'Ethereum Mainnet (1)', value: '1' },
          { label: 'Sepolia (11155111)', value: '11155111' },
          { label: 'Base Sepolia (84532)', value: '84532' },
        ],
      },
    ],
    getCodeSnippet: (params) => `import { useSwitchChain } from 'wagmi';

const { switchChain } = useSwitchChain();

switchChain({ chainId: ${params.chainId || 1} });`,
    buildParams: (params) => ({
      chainId: parseInt(params.chainId || '1'),
    }),
  },

  // ===== Transaction Methods =====
  {
    id: 'eth_sendTransaction',
    name: 'useSendTransaction',
    method: 'eth_sendTransaction',
    hookType: 'useSendTransaction',
    category: 'transaction',
    description: 'Send a transaction to the network',
    requiresConnection: true,
    parameters: [
      {
        name: 'to',
        type: 'address',
        label: 'Recipient Address',
        required: true,
      },
      {
        name: 'value',
        type: 'string',
        label: 'Amount (ETH)',
        description: 'Amount in ETH (e.g., 0.01)',
        required: true,
        defaultValue: '0.001',
      },
      {
        name: 'data',
        type: 'hex',
        label: 'Data (optional)',
        description: 'Transaction data in hex format',
        required: false,
      },
    ],
    getCodeSnippet: (params) => `import { useSendTransaction } from 'wagmi';
import { parseEther } from 'viem';

const { sendTransaction } = useSendTransaction();

sendTransaction({
  to: '${params.to || '0x...'}',
  value: parseEther('${params.value || '0.001'}'),${params.data ? `
  data: '${params.data}',` : ''}
});`,
    buildParams: (params) => ({
      to: params.to,
      value: params.value || '0.001',
      data: params.data || undefined,
    }),
  },
  {
    id: 'wallet_sendCalls',
    name: 'useSendCalls',
    method: 'wallet_sendCalls',
    hookType: 'useSendCalls',
    category: 'transaction',
    description: 'Send batch of calls to the network (EIP-5792)',
    requiresConnection: true,
    parameters: [
      {
        name: 'calls',
        type: 'json',
        label: 'Calls (JSON Array)',
        required: true,
        defaultValue: JSON.stringify([
          {
            to: '0x0000000000000000000000000000000000000000',
            value: '0x16345785d8a0000',
          },
        ], null, 2),
      },
    ],
    getCodeSnippet: (params) => `import { useSendCalls } from 'wagmi';

const { sendCalls } = useSendCalls();

sendCalls({
  calls: ${params.calls || '[]'},
});`,
    buildParams: (params) => {
      try {
        return { calls: JSON.parse(params.calls || '[]') };
      } catch {
        return { calls: [] };
      }
    },
  },
  {
    id: 'wallet_getCallsStatus',
    name: 'useCallsStatus',
    method: 'wallet_getCallsStatus',
    hookType: 'useCallsStatus',
    category: 'transaction',
    description: 'Get status of batch transaction (EIP-5792)',
    requiresConnection: false,
    parameters: [
      {
        name: 'id',
        type: 'hex',
        label: 'Batch ID',
        description: 'ID returned from wallet_sendCalls',
        required: true,
      },
    ],
    getCodeSnippet: (params) => `import { useCallsStatus } from 'wagmi';

const { data: callsStatus } = useCallsStatus({
  id: '${params.id || '0x...'}',
});

console.log('Status:', callsStatus?.status);
console.log('Receipts:', callsStatus?.receipts);`,
    buildParams: (params) => ({
      id: params.id,
    }),
  },

  // ===== Signing Methods =====
  {
    id: 'personal_sign',
    name: 'useSignMessage',
    method: 'personal_sign',
    hookType: 'useSignMessage',
    category: 'signing',
    description: 'Sign a message with EIP-191 (personal_sign)',
    requiresConnection: true,
    parameters: [
      {
        name: 'message',
        type: 'string',
        label: 'Message',
        required: true,
        defaultValue: 'Hello, World!',
      },
    ],
    getCodeSnippet: (params) => `import { useSignMessage } from 'wagmi';

const { signMessage, data: signature } = useSignMessage();

signMessage({ message: '${params.message || 'Hello, World!'}' });

console.log('Signature:', signature);`,
    buildParams: (params) => ({
      message: params.message || 'Hello, World!',
    }),
  },
  {
    id: 'eth_signTypedData_v4',
    name: 'useSignTypedData',
    method: 'eth_signTypedData_v4',
    hookType: 'useSignTypedData',
    category: 'signing',
    description: 'Sign structured typed data (EIP-712)',
    requiresConnection: true,
    parameters: [
      {
        name: 'typedData',
        type: 'json',
        label: 'Typed Data (JSON)',
        required: true,
        defaultValue: JSON.stringify({
          domain: {
            name: 'JAW Demo',
            version: '1',
          },
          types: {
            Person: [
              { name: 'name', type: 'string' },
              { name: 'wallet', type: 'address' },
            ],
            Mail: [
              { name: 'from', type: 'Person' },
              { name: 'to', type: 'Person' },
              { name: 'contents', type: 'string' },
            ],
          },
          primaryType: 'Mail',
          message: {
            from: { name: 'Alice', wallet: '0x0000000000000000000000000000000000000000' },
            to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
            contents: 'Hello, Bob!',
          },
        }, null, 2),
      },
    ],
    getCodeSnippet: (params) => {
      const typedData = params.typedData || '{}';
      return `import { useSignTypedData } from 'wagmi';

const { signTypedData, data: signature } = useSignTypedData();

const typedData = ${typedData};

signTypedData({
  domain: typedData.domain,
  types: typedData.types,
  primaryType: typedData.primaryType,
  message: typedData.message,
});

console.log('Signature:', signature);`;
    },
    buildParams: (params) => {
      try {
        return JSON.parse(params.typedData || '{}');
      } catch {
        return {};
      }
    },
  },

  // ===== Capability Methods =====
  {
    id: 'wallet_getCapabilities',
    name: 'useCapabilities',
    method: 'wallet_getCapabilities',
    hookType: 'useCapabilities',
    category: 'capability',
    description: 'Get wallet capabilities per chain (EIP-5792)',
    requiresConnection: false,
    parameters: [
      {
        name: 'address',
        type: 'address',
        label: 'Address',
        description: 'Account address (optional)',
        required: false,
        autoFill: 'address',
      },
    ],
    getCodeSnippet: (params) => `import { useCapabilities } from '@jaw.id/wagmi';

// Works without wallet connection when address is provided
const { data: capabilities, isLoading, refetch } = useCapabilities(${params.address ? `{
  address: '${params.address}',
}` : ''});

// Capabilities are keyed by chain ID (hex)
// e.g., { '0x14a34': { atomicBatch: { supported: true }, ... } }
console.log('Capabilities:', capabilities);`,
    buildParams: (params) => ({
      address: params.address || undefined,
    }),
  },

  // ===== Permission Methods =====
  {
    id: 'wallet_grantPermissions',
    name: 'useGrantPermissions',
    method: 'wallet_grantPermissions',
    hookType: 'useGrantPermissions',
    category: 'permission',
    description: 'Grant call and spend permissions to a spender (ERC-7715)',
    requiresConnection: true,
    parameters: [
      {
        name: 'spender',
        type: 'address',
        label: 'Spender Address',
        description: 'Address receiving permissions',
        required: true,
      },
      {
        name: 'expiryDays',
        type: 'number',
        label: 'Expiry (days)',
        description: 'Number of days until permission expires',
        required: true,
        defaultValue: '7',
      },
      {
        name: 'permissions',
        type: 'json',
        label: 'Permissions (JSON)',
        required: true,
        defaultValue: JSON.stringify({
          calls: [
            {
              target: '0x3232323232323232323232323232323232323232',
              selector: '0xe0e0e0e0',
            },
          ],
          spends: [
            {
              token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
              allowance: '0x16345785d8a0000',
              unit: 'day',
              multiplier: 1,
            },
          ],
        }, null, 2),
      },
    ],
    getCodeSnippet: (params) => `import { useGrantPermissions } from '@jaw.id/wagmi';

const { mutate: grantPermissions } = useGrantPermissions();

const expiryDays = ${params.expiryDays || 7};
const expiry = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);

grantPermissions({
  spender: '${params.spender || '0x...'}',
  expiry,
  permissions: ${params.permissions || '{}'},
});`,
    buildParams: (params) => {
      const expiryDays = parseInt(params.expiryDays || '7');
      const expiry = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);
      try {
        return {
          spender: params.spender,
          expiry,
          permissions: JSON.parse(params.permissions || '{}'),
        };
      } catch {
        return { spender: params.spender, expiry, permissions: {} };
      }
    },
  },
  {
    id: 'wallet_revokePermissions',
    name: 'useRevokePermissions',
    method: 'wallet_revokePermissions',
    hookType: 'useRevokePermissions',
    category: 'permission',
    description: 'Revoke previously granted permissions',
    requiresConnection: true,
    parameters: [
      {
        name: 'id',
        type: 'hex',
        label: 'Permission ID',
        description: 'ID of the permission to revoke',
        required: true,
      },
    ],
    getCodeSnippet: (params) => `import { useRevokePermissions } from '@jaw.id/wagmi';

const { mutate: revokePermissions } = useRevokePermissions();

revokePermissions({
  id: '${params.id || '0x...'}',
});`,
    buildParams: (params) => ({
      id: params.id,
    }),
  },
  {
    id: 'wallet_getPermissions',
    name: 'usePermissions',
    method: 'wallet_getPermissions',
    hookType: 'usePermissions',
    category: 'permission',
    description: 'Get all permissions for an account',
    requiresConnection: false,
    parameters: [
      {
        name: 'address',
        type: 'address',
        label: 'Address',
        description: 'Account address (optional if connected)',
        required: false,
        autoFill: 'address',
      },
    ],
    getCodeSnippet: (params) => `import { usePermissions } from '@jaw.id/wagmi';

// Works without wallet connection when address is provided
const { data: permissions, isLoading, refetch } = usePermissions(${params.address ? `{
  address: '${params.address}',
}` : ''});

console.log('Permissions:', permissions);`,
    buildParams: (params) => ({
      address: params.address || undefined,
    }),
  },

  // ===== Asset Methods =====
  {
    id: 'wallet_getAssets',
    name: 'useGetAssets',
    method: 'wallet_getAssets',
    hookType: 'useGetAssets',
    category: 'asset',
    description: 'Get token balances across chains (EIP-7811)',
    requiresConnection: false,
    parameters: [
      {
        name: 'address',
        type: 'address',
        label: 'Address',
        description: 'Account address (optional if connected)',
        required: false,
        autoFill: 'address',
      },
    ],
    getCodeSnippet: (params) => `import { useGetAssets } from '@jaw.id/wagmi';

// Works without wallet connection when address is provided
const { data: assets, isLoading, refetch } = useGetAssets(${params.address ? `{
  address: '${params.address}',
}` : ''});

// Assets are grouped by chain ID (hex)
// e.g., { '0x14a34': [{ address: '0x...', symbol: 'ETH', ... }] }
console.log('Assets:', assets);`,
    buildParams: (params) => ({
      address: params.address || undefined,
    }),
  },
];
