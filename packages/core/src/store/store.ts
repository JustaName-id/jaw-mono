import { SDK_VERSION } from '../sdk-info.js';
import { createJSONStorage, persist } from 'zustand/middleware';
import { StateCreator, createStore } from 'zustand/vanilla';
import { ChainSlice, KeysSlice, AccountSlice, ConfigSlice, StoreState, Account, Chain, Config } from './types.js';



const createChainSlice: StateCreator<StoreState, [], [], ChainSlice> = () => {
    return {
      chains: [],
    };
  };
  const createKeysSlice: StateCreator<StoreState, [], [], KeysSlice> = () => {
    return {
      keys: {},
    };
  };
  
  const createAccountSlice: StateCreator<StoreState, [], [], AccountSlice> = () => {
    return {
      account: {},
    };
  };

  const createConfigSlice: StateCreator<StoreState, [], [], ConfigSlice> = () => {
    return {
      config: {
        version: SDK_VERSION,
      },
    };
  };


  export const sdkstore = createStore(
    persist<StoreState>(
      (...args) => ({
        ...createChainSlice(...args),
        ...createKeysSlice(...args),
        ...createAccountSlice(...args),
        ...createConfigSlice(...args),
      }),
      {
        name: 'jawsdk.store',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => {
          // Explicitly select only the data properties we want to persist
          // (not the methods)
          return {
            chains: state.chains,
            keys: state.keys,
            account: state.account,
            config: state.config,
          } as StoreState;
        },
      }
    )
  );


  export const account = {
    get: () => sdkstore.getState().account,
    set: (account: Partial<Account>) => {
      sdkstore.setState((state) => ({
        account: { ...state.account, ...account },
      }));
    },
    clear: () => {
      sdkstore.setState({
        account: {},
      });
    },
  };
  
  export const chains = {
    get: () => sdkstore.getState().chains,
    set: (chains: Chain[]) => {
      sdkstore.setState({ chains });
    },
    clear: () => {
      sdkstore.setState({
        chains: [],
      });
    },
  };
  
  export const keys = {
    get: (key: string) => sdkstore.getState().keys[key],
    set: (key: string, value: string | null) => {
      sdkstore.setState((state) => ({ keys: { ...state.keys, [key]: value } }));
    },
    clear: () => {
      sdkstore.setState({
        keys: {},
      });
    },
  };
  
  export const config = {
    get: () => sdkstore.getState().config,
    set: (config: Partial<Config>) => {
      sdkstore.setState((state) => ({ config: { ...state.config, ...config } }));
    },
  };

  const actions = {
    account,
    chains,
    keys,
    config,
  };
  
  export const store = {
    ...sdkstore,
    ...actions,
  };
  
  