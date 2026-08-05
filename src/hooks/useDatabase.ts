// 数据库初始化 hook：在 App 启动时初始化 SQLite

import { useState, useEffect, useCallback } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '../db/client';

type DbState = {
  db: SQLiteDatabase | null;
  isLoading: boolean;
  error: Error | null;
};

export function useDatabase(): DbState {
  const [state, setState] = useState<DbState>({
    db: null,
    isLoading: true,
    error: null,
  });

  const init = useCallback(async () => {
    try {
      const db = await getDatabase();
      setState({ db, isLoading: false, error: null });
    } catch (err) {
      setState({ db: null, isLoading: false, error: err as Error });
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  return state;
}
