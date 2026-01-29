import { SUPPORTED_CHAINS } from '@jaw.id/core';

export type ParameterType = 'address' | 'hex' | 'number' | 'string' | 'json' | 'select';

export type ParameterDefinition = {
  name: string;
  type: ParameterType;
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
  options?: { label: string; value: string }[];
  autoFill?: 'address' | 'chainId'; // Auto-fill from connected state
};

export type MethodCategory = 'account' | 'chain' | 'transaction' | 'signing' | 'wallet' | 'capability' | 'permission' | 'asset';

export type RpcMethod = {
  id: string;
  name: string;
  method: string;
  category: MethodCategory;
  description: string;
  requiresConnection: boolean;
  parameters?: ParameterDefinition[];
  getCodeSnippet: (params: Record<string, string>) => string;
  buildParams: (params: Record<string, string>, context: { address?: string; chainId?: string }) => unknown[];
};

export const CATEGORY_COLORS: Record<MethodCategory, string> = {
  account: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  chain: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  transaction: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  signing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  wallet: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  capability: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  permission: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  asset: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

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

// Generate chain options dynamically from SUPPORTED_CHAINS
export const CHAIN_OPTIONS = [
  { label: 'Default (current chain)', value: 'default' },
  ...SUPPORTED_CHAINS.map(chain => ({
    label: `${chain.name} (${chain.id})`,
    value: `0x${chain.id.toString(16)}`,
  })),
];

export const RPC_METHODS: RpcMethod[] = [
  // ===== Account Methods =====
  {
    id: 'eth_requestAccounts',
    name: 'eth_requestAccounts',
    method: 'eth_requestAccounts',
    category: 'account',
    description: 'Request user authentication and account access',
    requiresConnection: false,
    parameters: [],
    getCodeSnippet: () => `const accounts = await jaw.provider.request({
  method: 'eth_requestAccounts',
  params: [],
});

console.log('Connected accounts:', accounts);`,
    buildParams: () => [],
  },
  {
    id: 'eth_accounts',
    name: 'eth_accounts',
    method: 'eth_accounts',
    category: 'account',
    description: 'Get currently connected accounts',
    requiresConnection: false,
    parameters: [],
    getCodeSnippet: () => `const accounts = await jaw.provider.request({
  method: 'eth_accounts',
  params: [],
});

console.log('Accounts:', accounts);`,
    buildParams: () => [],
  },

  // ===== Chain Methods =====
  {
    id: 'eth_chainId',
    name: 'eth_chainId',
    method: 'eth_chainId',
    category: 'chain',
    description: 'Get current chain ID (hex)',
    requiresConnection: false,
    parameters: [],
    getCodeSnippet: () => `const chainId = await jaw.provider.request({
  method: 'eth_chainId',
  params: [],
});

console.log('Chain ID:', chainId);`,
    buildParams: () => [],
  },
  {
    id: 'wallet_switchEthereumChain',
    name: 'wallet_switchEthereumChain',
    method: 'wallet_switchEthereumChain',
    category: 'chain',
    description: 'Switch to a different chain',
    requiresConnection: true,
    parameters: [
      {
        name: 'chainId',
        type: 'select',
        label: 'Chain',
        description: 'The chain to switch to',
        required: true,
        options: CHAIN_OPTIONS.filter(opt => opt.value !== 'default'),
      },
    ],
    getCodeSnippet: (params) => `await jaw.provider.request({
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: '${params.chainId || '0x1'}' }],
});`,
    buildParams: (params) => [{ chainId: params.chainId }],
  },

  // ===== Transaction Methods =====
  {
    id: 'eth_sendTransaction',
    name: 'eth_sendTransaction',
    method: 'eth_sendTransaction',
    category: 'transaction',
    description: 'Broadcast a transaction to the network',
    requiresConnection: true,
    parameters: [
      {
        name: 'chainId',
        type: 'select',
        label: 'Chain',
        description: 'Target chain for the transaction (optional)',
        required: false,
        options: CHAIN_OPTIONS,
        defaultValue: 'default',
      },
      {
        name: 'to',
        type: 'address',
        label: 'To Address',
        description: 'Recipient address',
        required: true,
        defaultValue: '0x',
      },
      {
        name: 'value',
        type: 'string',
        label: 'Value (ETH)',
        description: 'Amount of ETH to send',
        required: false,
        defaultValue: '0',
      },
      {
        name: 'data',
        type: 'hex',
        label: 'Data',
        description: 'Transaction data (hex)',
        required: false,
        defaultValue: '0x',
      },
    ],
    getCodeSnippet: (params) => {
      const value = params.value ? `parseEther('${params.value}')` : '0n';
      const chainIdLine = params.chainId && params.chainId !== 'default' ? `\n    chainId: '${params.chainId}',` : '';
      return `import { parseEther } from 'viem';

const txHash = await jaw.provider.request({
  method: 'eth_sendTransaction',
  params: [{
    from: account,
    to: '${params.to || '0x...'}',
    value: \`0x\${${value}.toString(16)}\`,
    data: '${params.data || '0x'}',${chainIdLine}
  }],
});

console.log('Transaction hash:', txHash);`;
    },
    buildParams: (params, context) => {
      const valueWei = params.value ? BigInt(Math.floor(parseFloat(params.value) * 1e18)) : 0n;
      const result: { from?: string; to: string; value: string; data: string; chainId?: string } = {
        from: context.address,
        to: params.to,
        value: `0x${valueWei.toString(16)}`,
        data: params.data || '0x',
      };
      if (params.chainId && params.chainId !== 'default') {
        result.chainId = params.chainId;
      }
      return [result];
    },
  },
  {
    id: 'wallet_sendCalls',
    name: 'wallet_sendCalls',
    method: 'wallet_sendCalls',
    category: 'transaction',
    description: 'Broadcast bundle of calls to the network (EIP-5792)',
    requiresConnection: false,
    parameters: [
      {
        name: 'chainId',
        type: 'select',
        label: 'Chain',
        description: 'Target chain for the transaction (optional)',
        required: false,
        options: CHAIN_OPTIONS,
        defaultValue: 'default',
      },
      {
        name: 'calls',
        type: 'json',
        label: 'Calls (JSON)',
        description: 'Array of call objects: [{ to, value, data }]',
        required: true,
        defaultValue: JSON.stringify([
          {
            to: '0x0000000000000000000000000000000000000000',
            value: '0x2386F26FC10000',
            data: '0x'
          },
        ], null, 2),
      },
    ],
    getCodeSnippet: (params) => {
      const callsStr = params.calls || '[{ to: "0x...", value: "0x2386F26FC10000", data: "0x" }]';
      const chainIdLine = params.chainId && params.chainId !== 'default' ? `\n    chainId: '${params.chainId}',` : '';
      return `// Send 0.01 ETH
const result = await jaw.provider.request({
  method: 'wallet_sendCalls',
  params: [{${chainIdLine}
    calls: ${callsStr},
  }],
});

console.log('Batch ID:', result.id);`;
    },
    buildParams: (params) => {
      const calls = JSON.parse(params.calls || '[]');
      const result: { calls: unknown[]; chainId?: string } = { calls };
      if (params.chainId && params.chainId !== 'default') {
        result.chainId = params.chainId;
      }
      return [result];
    },
  },
  {
    id: 'wallet_getCallsStatus',
    name: 'wallet_getCallsStatus',
    method: 'wallet_getCallsStatus',
    category: 'transaction',
    description: 'Get batch transaction status',
    requiresConnection: false,
    parameters: [
      {
        name: 'batchId',
        type: 'hex',
        label: 'Batch ID',
        description: 'The batch ID from wallet_sendCalls',
        required: true,
      },
    ],
    getCodeSnippet: (params) => `const status = await jaw.provider.request({
  method: 'wallet_getCallsStatus',
  params: ['${params.batchId || '0x...'}'],
});

// Status codes: 100=pending, 200=completed, 400=failed, 500=reverted
console.log('Status:', status.status);
console.log('Receipts:', status.receipts);`,
    buildParams: (params) => [params.batchId],
  },
  {
    id: 'wallet_getCallsHistory',
    name: 'wallet_getCallsHistory',
    method: 'wallet_getCallsHistory',
    category: 'transaction',
    description: 'Get transaction history for an account',
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
      {
        name: 'limit',
        type: 'number',
        label: 'Limit',
        description: 'Maximum number of bundles to return (default: 20)',
        required: false,
        defaultValue: '20',
      },
      {
        name: 'sort',
        type: 'select',
        label: 'Sort',
        description: 'Sort direction (default: desc - newest first)',
        required: false,
        defaultValue: 'desc',
        options: [
          { label: 'Newest first (desc)', value: 'desc' },
          { label: 'Oldest first (asc)', value: 'asc' },
        ],
      },
    ],
    getCodeSnippet: (params) => `const history = await jaw.provider.request({
  method: 'wallet_getCallsHistory',
  params: [{
    address: '${params.address || 'account'}',
    limit: ${params.limit || 20},
    sort: '${params.sort || 'desc'}',
  }],
});

// History contains bundles with calls and receipts
console.log('History:', history);`,
    buildParams: (params, context) => [{
      address: params.address || context.address,
      limit: params.limit ? parseInt(params.limit) : undefined,
      sort: params.sort || undefined,
    }],
  },

  // ===== Signing Methods =====
  {
    id: 'personal_sign',
    name: 'personal_sign',
    method: 'personal_sign',
    category: 'signing',
    description: 'Sign a message with EIP-191',
    requiresConnection: true,
    parameters: [
      {
        name: 'message',
        type: 'string',
        label: 'Message',
        description: 'Message to sign (will be hex encoded)',
        required: true,
        defaultValue: 'Hello, World!',
      },
    ],
    getCodeSnippet: (params) => `const message = '${params.message || 'Hello, World!'}';

const signature = await jaw.provider.request({
  method: 'personal_sign',
  params: [message, account],
});

console.log('Signature:', signature);`,
    buildParams: (params, context) => {
      const message = params.message || 'Hello, World!';
      return [message, context.address];
    },
  },
  {
    id: 'eth_signTypedData_v4',
    name: 'eth_signTypedData_v4',
    method: 'eth_signTypedData_v4',
    category: 'signing',
    description: 'Sign structured typed data (EIP-712)',
    requiresConnection: true,
    parameters: [
      {
        name: 'typedData',
        type: 'json',
        label: 'Typed Data (JSON)',
        description: 'EIP-712 typed data object',
        required: true,
        defaultValue: JSON.stringify({
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
            ],
            Person: [
              { name: 'name', type: 'string' },
              { name: 'wallet', type: 'address' },
            ],
          },
          primaryType: 'Person',
          domain: {
            name: 'My DApp',
            version: '1',
            chainId: 1,
          },
          message: {
            name: 'Alice',
            wallet: '0x0000000000000000000000000000000000000000',
          },
        }, null, 2),
      },
    ],
    getCodeSnippet: (params) => `const typedData = ${params.typedData || '{}'};

const signature = await jaw.provider.request({
  method: 'eth_signTypedData_v4',
  params: [account, JSON.stringify(typedData)],
});

console.log('Signature:', signature);`,
    buildParams: (params, context) => {
      // typedData comes as a JSON string from the textarea, we need to pass it as-is (already stringified)
      // But if user edited it, we should re-stringify to ensure proper formatting
      try {
        const parsed = JSON.parse(params.typedData || '{}');
        return [context.address, JSON.stringify(parsed)];
      } catch {
        return [context.address, params.typedData];
      }
    },
  },
  {
    id: 'wallet_sign',
    name: 'wallet_sign',
    method: 'wallet_sign',
    category: 'signing',
    description: 'Unified signing method supporting multiple formats (ERC-7871)',
    requiresConnection: false,
    parameters: [
      {
        name: 'chainId',
        type: 'select',
        label: 'Chain',
        description: 'Target chain for signing (optional)',
        required: false,
        options: CHAIN_OPTIONS,
        defaultValue: 'default',
      },
      {
        name: 'type',
        type: 'select',
        label: 'Signature Type',
        description: 'The type of signature',
        required: true,
        options: [
          { label: '0x45 - Personal Sign (EIP-191)', value: '0x45' },
          { label: '0x01 - Typed Data (EIP-712)', value: '0x01' },
        ],
        defaultValue: '0x45',
      },
      {
        name: 'message',
        type: 'string',
        label: 'Message (for 0x45)',
        description: 'Plain text message to sign',
        required: false,
        defaultValue: 'Hello, World!',
      },
      {
        name: 'typedData',
        type: 'json',
        label: 'Typed Data (for 0x01)',
        description: 'EIP-712 typed data object',
        required: false,
        defaultValue: JSON.stringify({
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
            ],
            Person: [
              { name: 'name', type: 'string' },
              { name: 'wallet', type: 'address' },
            ],
          },
          primaryType: 'Person',
          domain: {
            name: 'My DApp',
            version: '1',
            chainId: 1,
          },
          message: {
            name: 'Alice',
            wallet: '0x0000000000000000000000000000000000000000',
          },
        }, null, 2),
      },
    ],
    getCodeSnippet: (params) => {
      const type = params.type || '0x45';
      const chainIdLine = params.chainId && params.chainId !== 'default' ? `\n    chainId: '${params.chainId}',` : '';
      if (type === '0x45') {
        return `const signature = await jaw.provider.request({
  method: 'wallet_sign',
  params: [{${chainIdLine}
    request: {
      type: '0x45',
      data: {
        message: '${params.message || 'Hello, World!'}',
      },
    },
  }],
});

console.log('Signature:', signature);`;
      } else {
        return `const typedData = ${params.typedData || '{}'};

const signature = await jaw.provider.request({
  method: 'wallet_sign',
  params: [{${chainIdLine}
    request: {
      type: '0x01',
      data: typedData,
    },
  }],
});

console.log('Signature:', signature);`;
      }
    },
    buildParams: (params) => {
      const type = params.type || '0x45';
      const result: { chainId?: string; request: { type: string; data: unknown } } = {
        request: {
          type,
          data: type === '0x45'
            ? { message: params.message || 'Hello, World!' }
            : JSON.parse(params.typedData || '{}'),
        },
      };
      if (params.chainId && params.chainId !== 'default') {
        result.chainId = params.chainId;
      }
      return [result];
    },
  },

  // ===== Wallet Methods =====
  {
    id: 'wallet_connect',
    name: 'wallet_connect',
    method: 'wallet_connect',
    category: 'wallet',
    description: 'Connect with advanced capabilities (SIWE, subnames)',
    requiresConnection: false,
    parameters: [
      {
        name: 'enableSiwe',
        type: 'select',
        label: 'Enable SIWE',
        description: 'Request Sign-In with Ethereum capability',
        required: false,
        options: [
          { label: 'No', value: 'false' },
          { label: 'Yes', value: 'true' },
        ],
        defaultValue: 'false',
      },
      {
        name: 'siweStatement',
        type: 'string',
        label: 'SIWE Statement',
        description: 'Human-readable statement for SIWE',
        required: false,
        defaultValue: 'Sign in with your JAW account',
      },
      {
        name: 'enableSubnameTextRecords',
        type: 'select',
        label: 'Enable Subname Text Records',
        description: 'Request subname with text records (requires ENS configured)',
        required: false,
        options: [
          { label: 'No', value: 'false' },
          { label: 'Yes', value: 'true' },
        ],
        defaultValue: 'false',
      },
      {
        name: 'subnameTextRecords',
        type: 'json',
        label: 'Text Records (JSON)',
        description: 'Array of { key, value } records to set on the subname',
        required: false,
        defaultValue: JSON.stringify([
          { key: 'com.twitter', value: '@myhandle' },
          { key: 'com.github', value: 'myusername' },
        ], null, 2),
      },
    ],
    getCodeSnippet: (params) => {
      const enableSiwe = params.enableSiwe === 'true';
      const enableSubnameTextRecords = params.enableSubnameTextRecords === 'true';

      const capabilities: string[] = [];

      if (enableSiwe) {
        capabilities.push(`      signInWithEthereum: {
        nonce,
        chainId: '0x1',
        statement: '${params.siweStatement || 'Sign in with your JAW account'}',
      }`);
      }

      if (enableSubnameTextRecords) {
        const records = params.subnameTextRecords || '[{ "key": "com.twitter", "value": "@myhandle" }]';
        capabilities.push(`      subnameTextRecords: ${records}`);
      }

      if (capabilities.length > 0) {
        const nonceDecl = enableSiwe ? 'const nonce = crypto.randomUUID();\n\n' : '';
        return `${nonceDecl}const result = await jaw.provider.request({
  method: 'wallet_connect',
  params: [{
    capabilities: {
${capabilities.join(',\n')}
    },
  }],
});

console.log('Connected:', result.accounts);${enableSiwe ? `
console.log('SIWE:', result.accounts[0]?.capabilities?.signInWithEthereum);` : ''}${enableSubnameTextRecords ? `
console.log('Subname:', result.accounts[0]?.capabilities?.subnameTextRecords);` : ''}`;
      }

      return `const result = await jaw.provider.request({
  method: 'wallet_connect',
  params: [{}],
});

console.log('Connected accounts:', result.accounts);`;
    },
    buildParams: (params) => {
      const enableSiwe = params.enableSiwe === 'true';
      const enableSubnameTextRecords = params.enableSubnameTextRecords === 'true';

      if (!enableSiwe && !enableSubnameTextRecords) {
        return [{}];
      }

      const capabilities: Record<string, unknown> = {};

      if (enableSiwe) {
        const nonce = Math.random().toString(36).substring(2, 15);
        capabilities.signInWithEthereum = {
          nonce,
          chainId: '0x1',
          statement: params.siweStatement || 'Sign in with your JAW account',
        };
      }

      if (enableSubnameTextRecords) {
        try {
          capabilities.subnameTextRecords = JSON.parse(params.subnameTextRecords || '[]');
        } catch {
          capabilities.subnameTextRecords = [];
        }
      }

      return [{ capabilities }];
    },
  },
  {
    id: 'wallet_disconnect',
    name: 'wallet_disconnect',
    method: 'wallet_disconnect',
    category: 'wallet',
    description: 'Disconnect current session',
    requiresConnection: true,
    parameters: [],
    getCodeSnippet: () => `await jaw.provider.request({
  method: 'wallet_disconnect',
  params: [],
});

console.log('Disconnected');`,
    buildParams: () => [],
  },

  // ===== Capability Methods =====
  {
    id: 'wallet_getCapabilities',
    name: 'wallet_getCapabilities',
    method: 'wallet_getCapabilities',
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
    getCodeSnippet: (params) => `const capabilities = await jaw.provider.request({
  method: 'wallet_getCapabilities',
  params: [${params.address ? `'${params.address}'` : 'undefined'}],
});

console.log('Capabilities:', capabilities);`,
    buildParams: (params, context) => [params.address || context.address],
  },

  // ===== Permission Methods =====
  {
    id: 'wallet_grantPermissions',
    name: 'wallet_grantPermissions',
    method: 'wallet_grantPermissions',
    category: 'permission',
    description: 'Grant call and spend permissions to a spender',
    requiresConnection: false,
    parameters: [
      {
        name: 'chainId',
        type: 'select',
        label: 'Chain',
        description: 'Target chain for the permission (optional)',
        required: false,
        options: CHAIN_OPTIONS,
        defaultValue: 'default',
      },
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
        defaultValue: '30',
      },
      {
        name: 'permissions',
        type: 'json',
        label: 'Permissions (JSON)',
        required: true,
        defaultValue: JSON.stringify({
          calls: [
            {
              target: '0x3232323232323232323232323232323232323232', // ANY_TARGET - wildcard
              selector: '0xe0e0e0e0', // EMPTY_CALLDATA_FN_SEL - for ETH transfers
            },
          ],
          spends: [
            {
              token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // NATIVE_TOKEN - native ETH
              allowance: '0x16345785d8a0000', // 0.1 ETH
              unit: 'day',
              multiplier: 1,
            },
          ],
        }, null, 2),
      },
    ],
    getCodeSnippet: (params) => {
      const chainIdLine = params.chainId && params.chainId !== 'default' ? `\n    chainId: '${params.chainId}',` : '';
      return `const expiryDays = ${params.expiryDays || 30};
const expiry = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);

const result = await jaw.provider.request({
  method: 'wallet_grantPermissions',
  params: [{${chainIdLine}
    expiry,
    spender: '${params.spender || '0x...'}',
    permissions: ${params.permissions || '{}'},
  }],
});

console.log('Permission ID:', result.permissionId);`;
    },
    buildParams: (params) => {
      const expiryDays = parseInt(params.expiryDays || '30');
      const expiry = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);
      const permissions = JSON.parse(params.permissions || '{}');
      const result: { expiry: number; spender: string; permissions: unknown; chainId?: string } = {
        expiry,
        spender: params.spender,
        permissions,
      };
      if (params.chainId && params.chainId !== 'default') {
        result.chainId = params.chainId;
      }
      return [result];
    },
  },
  {
    id: 'wallet_revokePermissions',
    name: 'wallet_revokePermissions',
    method: 'wallet_revokePermissions',
    category: 'permission',
    description: 'Revoke previously granted permissions',
    requiresConnection: false,
    parameters: [
      {
        name: 'permissionId',
        type: 'hex',
        label: 'Permission ID',
        description: 'ID of the permission to revoke',
        required: true,
      },
    ],
    getCodeSnippet: (params) => `await jaw.provider.request({
  method: 'wallet_revokePermissions',
  params: [{
    id: '${params.permissionId || '0x...'}',
  }],
});

console.log('Permission revoked');`,
    buildParams: (params, context) => [{
      address: context.address,
      id: params.permissionId,
    }],
  },
  {
    id: 'wallet_getPermissions',
    name: 'wallet_getPermissions',
    method: 'wallet_getPermissions',
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
    getCodeSnippet: (params) => `const permissions = await jaw.provider.request({
  method: 'wallet_getPermissions',
  params: [{
    address: '${params.address || 'account'}',
  }],
});

console.log('Permissions:', permissions);`,
    buildParams: (params, context) => [{
      address: params.address || context.address,
    }],
  },

  // ===== Asset Methods =====
  {
    id: 'wallet_getAssets',
    name: 'wallet_getAssets',
    method: 'wallet_getAssets',
    category: 'asset',
    description: 'Get token balances across chains (EIP-7811)',
    requiresConnection: false,
    parameters: [
      {
        name: 'address',
        type: 'address',
        label: 'Address',
        description: 'Account address',
        required: false,
        autoFill: 'address',
      },
    ],
    getCodeSnippet: (params) => `const assets = await jaw.provider.request({
  method: 'wallet_getAssets',
  params: [{
    account: '${params.address || 'account'}',
  }],
});

console.log('Assets:', assets);`,
    buildParams: (params, context) => [{
      account: params.address || context.address,
    }],
  },
];

// Group methods by category
export const METHODS_BY_CATEGORY = RPC_METHODS.reduce((acc, method) => {
  if (!acc[method.category]) {
    acc[method.category] = [];
  }
  acc[method.category].push(method);
  return acc;
}, {} as Record<MethodCategory, RpcMethod[]>);

// Get all categories in order
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
