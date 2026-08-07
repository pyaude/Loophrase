// 更新状态全局 store — 连接 useUpdateCheck Hook 与 UpdateModal、设置页

import { create } from 'zustand';
import { checkForUpdate, type UpdateCheckResult } from '../services/update';

interface UpdateState {
  updateInfo: UpdateCheckResult | null;
  checking: boolean;
  autoChecked: boolean;
  /** 手动触发检查（忽略 24h 缓存），出错时抛出异常 */
  checkManually: () => Promise<UpdateCheckResult>;
  /** 自动检查（遵守 24h 缓存） */
  checkAuto: () => Promise<void>;
  /** 关闭更新提示 */
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  updateInfo: null,
  checking: false,
  autoChecked: false,

  checkManually: async () => {
    set({ checking: true });
    try {
      const result = await checkForUpdate(true);
      if (result.has_update) {
        set({ updateInfo: result });
      } else {
        set({ updateInfo: null });
      }
      return result;
    } finally {
      set({ checking: false });
    }
  },

  checkAuto: async () => {
    try {
      const result = await checkForUpdate(false);
      if (result.has_update) {
        set({ updateInfo: result });
      }
    } catch {
      // 自动检查静默失败
    } finally {
      set({ autoChecked: true });
    }
  },

  dismiss: () => set({ updateInfo: null }),
}));
