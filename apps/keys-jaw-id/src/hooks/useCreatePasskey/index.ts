

export interface UseCreatePasskeyResult {
  address: string;
}

export function useCreatePasskey() {
 
  return {
    mutateAsync: async (username: string): Promise<UseCreatePasskeyResult> => {
      throw new Error('useCreatePasskey not implemented yet');
    },
    isPending: false,
  };
}
