export default {
  index: 'Overview',
  '---account': {
    type: 'separator',
    title: 'Account Methods',
  },
  eth_requestAccounts: 'eth_requestAccounts',
  eth_accounts: 'eth_accounts',
  '---chain': {
    type: 'separator',
    title: 'Chain Methods',
  },
  eth_chainId: 'eth_chainId',
  wallet_switchEthereumChain: 'wallet_switchEthereumChain',
  '---transaction': {
    type: 'separator',
    title: 'Transaction Methods',
  },
  eth_sendTransaction: 'eth_sendTransaction',
  wallet_sendCalls: 'wallet_sendCalls',
  wallet_getCallsStatus: 'wallet_getCallsStatus',
  wallet_showCallsStatus: 'wallet_showCallsStatus',
  '---signing': {
    type: 'separator',
    title: 'Signing Methods',
  },
  personal_sign: 'personal_sign',
  eth_signTypedData_v4: 'eth_signTypedData_v4',
  wallet_sign: 'wallet_sign',
  '---wallet': {
    type: 'separator',
    title: 'Wallet Methods',
  },
  wallet_connect: 'wallet_connect',
  wallet_disconnect: 'wallet_disconnect',
  '---capability': {
    type: 'separator',
    title: 'Capability Methods',
  },
  wallet_getCapabilities: 'wallet_getCapabilities',
  '---permission': {
    type: 'separator',
    title: 'Permission Methods',
  },
  wallet_grantPermissions: 'wallet_grantPermissions',
  wallet_revokePermissions: 'wallet_revokePermissions',
  wallet_getPermissions: 'wallet_getPermissions',
  '---asset': {
    type: 'separator',
    title: 'Asset Methods',
  },
  wallet_getAssets: 'wallet_getAssets',
}