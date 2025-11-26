import { useState, useEffect } from 'react';
import { Address } from 'viem';
import { useJAWProvider } from '../context';

export function useAddress(): Address | null {
  const provider = useJAWProvider();
  const [address, setAddress] = useState<Address | null>(null);

  useEffect(() => {
    // Get initial accounts
    provider.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const accountsList = accounts as Address[];
        setAddress(accountsList[0] || null);
      })
      .catch(() => setAddress(null));

    // Listen for account changes
    const handleAccountsChanged = (accounts: string[]) => {
      setAddress((accounts[0] as Address) || null);
    };

    provider.on('accountsChanged', handleAccountsChanged);

    return () => {
      provider.off('accountsChanged', handleAccountsChanged);
    };
  }, [provider]);

  return address;
}