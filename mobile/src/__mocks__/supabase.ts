// Mock: @supabase/supabase-js

export type SupabaseClient = {
  auth: {
    getUser: jest.Mock;
    signInWithPassword: jest.Mock;
    signOut: jest.Mock;
  };
  from: jest.Mock;
};

export function createClient(url: string, key: string): SupabaseClient {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  };
}

export type { SupabaseClient as default };
