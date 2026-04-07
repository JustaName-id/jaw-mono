import { SDK_VERSION } from '../sdk-info.js';
import { createJSONStorage, persist } from 'zustand/middleware';
import { StateCreator, createStore } from 'zustand/vanilla';
import {
    ChainSlice,
    KeysSlice,
    AccountSlice,
    ConfigSlice,
    CallStatusSlice,
    StoreState,
    Account,
    Chain,
    Config,
    CallStatus,
} from './types.js';

/**
 * Recursively converts BigInt values to strings for JSON serialization
 */
function serializeBigInt(value: unknown): unknown {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value === null || value === undefined) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(serializeBigInt);
    }
    if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = serializeBigInt(val);
        }
        return result;
    }
    return value;
}

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

const createCallStatusSlice: StateCreator<StoreState, [], [], CallStatusSlice> = () => {
    return {
        callStatuses: {},
    };
};

export const sdkstore = createStore(
    persist<StoreState>(
        (...args) => ({
            ...createChainSlice(...args),
            ...createKeysSlice(...args),
            ...createAccountSlice(...args),
            ...createConfigSlice(...args),
            ...createCallStatusSlice(...args),
        }),
        {
            name: 'jawsdk.store',
            storage: createJSONStorage(() => {
                if (typeof localStorage !== 'undefined') return localStorage;
                // No-op storage for non-browser environments (CLI, Node.js)
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                return {
                    getItem: () => null,
                    setItem() {
                        /* noop */
                    },
                    removeItem() {
                        /* noop */
                    },
                };
            }),
            partialize: (state) => {
                // Explicitly select only the data properties we want to persist
                // (not the methods)
                // Serialize callStatuses receipts to handle BigInt values
                const serializedCallStatuses = Object.entries(state.callStatuses).reduce(
                    (acc, [key, status]) => {
                        acc[key] = {
                            ...status,
                            receipts: status.receipts
                                ? (serializeBigInt(status.receipts) as unknown[])
                                : status.receipts,
                        };
                        return acc;
                    },
                    {} as Record<string, CallStatus>
                );

                return {
                    chains: state.chains,
                    keys: state.keys,
                    account: state.account,
                    config: state.config,
                    callStatuses: serializedCallStatuses,
                } as StoreState;
            },
        }
    )
);

export const account = {
    get: () => sdkstore.getState().account,
    set: (account: Partial<Account>) => {
        sdkstore.setState((state) => ({
            account: {
                ...state.account,
                ...account,
                // Set connectedAt when accounts are provided (new connection)
                ...(account.accounts && { connectedAt: Date.now() }),
            },
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

export const callStatuses = {
    get: (batchId: string) => sdkstore.getState().callStatuses[batchId],
    set: (batchId: string, status: CallStatus) => {
        // Serialize receipts to handle BigInt values before storing
        const serializedStatus: CallStatus = {
            ...status,
            receipts: status.receipts ? (serializeBigInt(status.receipts) as unknown[]) : status.receipts,
        };
        sdkstore.setState((state) => ({
            callStatuses: { ...state.callStatuses, [batchId]: serializedStatus },
        }));
    },
    update: (batchId: string, updates: Partial<CallStatus>) => {
        const current = sdkstore.getState().callStatuses[batchId];
        if (current) {
            // Serialize receipts if they're being updated
            const serializedUpdates: Partial<CallStatus> = {
                ...updates,
                receipts: updates.receipts ? (serializeBigInt(updates.receipts) as unknown[]) : updates.receipts,
            };
            sdkstore.setState((state) => ({
                callStatuses: { ...state.callStatuses, [batchId]: { ...current, ...serializedUpdates } },
            }));
        }
    },
    clear: () => {
        sdkstore.setState({
            callStatuses: {},
        });
    },
};

const actions = {
    account,
    chains,
    keys,
    config,
    callStatuses,
};

export const store = {
    ...sdkstore,
    ...actions,
};
