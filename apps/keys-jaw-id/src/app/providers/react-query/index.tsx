'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export const ReactQueryProvider = ({ children }: { children: React.ReactNode }) => {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnWindowFocus: false,
            },
            mutations: {
                onError: (error) => {
                    console.error('Mutation error:', error);
                },
            },
        },
    }));
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};