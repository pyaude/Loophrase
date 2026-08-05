// sync 服务单元测试
// 覆盖：getSupabase, isSyncAvailable, syncToCloud, syncFromCloud

// 在 require sync.ts 之前设置环境变量
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Mock 依赖
jest.mock('expo-secure-store');
jest.mock('../../db/client');
jest.mock('../../db/repositories');

// Mock supabase 模块以控制 auth/from 返回值
jest.mock('@supabase/supabase-js', () => {
  const mockAuth = {
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
  };
  const mockFromReturn = {
    upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  const mockFrom = jest.fn(() => mockFromReturn);

  return {
    createClient: jest.fn(() => ({
      auth: mockAuth,
      from: mockFrom,
      __mockAuth: mockAuth,
      __mockFrom: mockFrom,
      __mockFromReturn: mockFromReturn,
    })),
  };
});

const { getSupabase, isSyncAvailable, syncToCloud, syncFromCloud } = require('../sync');
const { getDatabase } = require('../../db/client');
const { getAllProjects, getSegmentsByProject } = require('../../db/repositories');

describe('sync service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================
  // getSupabase
  // ============================
  describe('getSupabase', () => {
    it('有配置时返回 Supabase 客户端', () => {
      const supabase = getSupabase();
      expect(supabase).not.toBeNull();
      expect(supabase.auth).toBeDefined();
      expect(supabase.from).toBeDefined();
    });

    it('返回单例（多次调用返回同一实例）', () => {
      const first = getSupabase();
      const second = getSupabase();
      expect(first).toBe(second);
    });

    it('多次调用不重复创建客户端（单例）', () => {
      const first = getSupabase();
      const second = getSupabase();
      expect(first).toBe(second); // 同一引用即说明没有重新创建
    });
  });

  // ============================
  // isSyncAvailable
  // ============================
  describe('isSyncAvailable', () => {
    it('在 getSupabase 调用后返回 true', () => {
      getSupabase(); // 触发初始化
      expect(isSyncAvailable()).toBe(true);
    });
  });

  // ============================
  // syncToCloud
  // ============================
  describe('syncToCloud', () => {
    it('用户未登录时返回错误', async () => {
      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const result = await syncToCloud();

      expect(result.synced).toBe(0);
      expect(result.errors).toContain('Not logged in');
    });

    it('空项目列表时返回 synced=0', async () => {
      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      getDatabase.mockResolvedValue({});
      getAllProjects.mockResolvedValue([]);

      const result = await syncToCloud();

      expect(result.synced).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('正常同步一个项目（无切片）', async () => {
      const mockProject = {
        id: 'proj-1',
        title: 'Test Movie',
        local_uri: 'file:///movie.mp4',
        duration_ms: 60000,
        source_type: 'video',
        has_audio: true,
        created_at: 1700000000000,
        updated_at: 1700000001000,
      };

      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      getDatabase.mockResolvedValue({});
      getAllProjects.mockResolvedValue([mockProject]);
      getSegmentsByProject.mockResolvedValue([]);

      const result = await syncToCloud();

      expect(result.synced).toBe(1);
      expect(result.errors).toHaveLength(0);

      // 验证 upsert 调用
      expect(supabase.from).toHaveBeenCalledWith('media_project');
      const upsertCall = supabase.from.mock.results[0].value.upsert;
      const upsertPayload = upsertCall.mock.calls[0][0];
      expect(upsertPayload.id).toBe('proj-1');
      expect(upsertPayload.user_id).toBe('user-1');
      expect(upsertPayload.title).toBe('Test Movie');
      expect(upsertPayload.duration_ms).toBe(60000);
      expect(upsertPayload).not.toHaveProperty('local_uri');
    });

    it('正常同步一个项目 + 多个切片', async () => {
      const mockProject = {
        id: 'proj-1',
        title: 'Test',
        local_uri: 'file:///test.mp4',
        duration_ms: 30000,
        source_type: 'video',
        has_audio: true,
        created_at: 1700000000000,
        updated_at: 1700000001000,
      };
      const mockSegments = [
        {
          id: 'seg-1', project_id: 'proj-1', order_index: 0,
          start_ms: 0, end_ms: 3000, text: 'Hello world',
          confidence: 0.95, skip_type: null, source: 'subtitle',
          status: 'confirmed', created_at: 1700000000000, updated_at: 1700000000000,
        },
        {
          id: 'seg-2', project_id: 'proj-1', order_index: 1,
          start_ms: 3000, end_ms: 6000, text: 'How are you',
          confidence: null, skip_type: null, source: 'subtitle',
          status: 'confirmed', created_at: 1700000000000, updated_at: 1700000000000,
        },
      ];

      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      getDatabase.mockResolvedValue({});
      getAllProjects.mockResolvedValue([mockProject]);
      getSegmentsByProject.mockResolvedValue(mockSegments);

      // 为该项目和切片分别设置 from() 的返回值
      const projUpsert = jest.fn().mockResolvedValue({ data: null, error: null });
      const segUpsert = jest.fn().mockResolvedValue({ data: null, error: null });
      supabase.from
        .mockReturnValueOnce({ upsert: projUpsert })
        .mockReturnValueOnce({ upsert: segUpsert });

      const result = await syncToCloud();

      expect(result.synced).toBe(3); // 2 segments + 1 project
      expect(result.errors).toHaveLength(0);

      // 验证 segment upsert 被传入数组
      expect(supabase.from).toHaveBeenCalledWith('segment');
      const segPayload = segUpsert.mock.calls[0][0];
      expect(Array.isArray(segPayload)).toBe(true);
      expect(segPayload).toHaveLength(2);
      expect(segPayload[0]).not.toHaveProperty('recording_uri');
      expect(segPayload[0]).not.toHaveProperty('local_uri');
    });

    it('项目 upsert 出错时记录错误并跳过切片', async () => {
      const mockProject = {
        id: 'proj-err', title: 'Error', local_uri: '', duration_ms: 1000,
        source_type: 'audio', has_audio: true,
        created_at: 1700000000000, updated_at: 1700000000000,
      };

      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      getDatabase.mockResolvedValue({});
      getAllProjects.mockResolvedValue([mockProject]);
      getSegmentsByProject.mockResolvedValue([]);

      // 让 from() 返回一个 upsert 带 error 的对象
      supabase.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'RLS policy violation' },
        }),
      });

      const result = await syncToCloud();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('proj-err');
      expect(result.errors[0]).toContain('RLS policy violation');
    });

    it('切片 upsert 出错时记录错误但不影响项目计数', async () => {
      const mockProject = {
        id: 'proj-2', title: 'P', local_uri: '', duration_ms: 1000,
        source_type: 'video', has_audio: true,
        created_at: 1700000000000, updated_at: 1700000000000,
      };
      const mockSegments = [
        {
          id: 'seg-x', project_id: 'proj-2', order_index: 0,
          start_ms: 0, end_ms: 1000, text: 'x', confidence: null,
          skip_type: null, source: 'manual', status: 'pending',
          created_at: 1700000000000, updated_at: 1700000000000,
        },
      ];

      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      getDatabase.mockResolvedValue({});
      getAllProjects.mockResolvedValue([mockProject]);
      getSegmentsByProject.mockResolvedValue(mockSegments);

      supabase.from
        .mockReturnValueOnce({
          upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
        })
        .mockReturnValueOnce({
          upsert: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Foreign key violation' },
          }),
        });

      const result = await syncToCloud();

      expect(result.synced).toBe(1); // 项目成功但切片失败
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Segments for proj-2');
    });

    it('数据库异常被 catch 捕获', async () => {
      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      getDatabase.mockRejectedValue(new Error('Database connection lost'));

      const result = await syncToCloud();

      expect(result.synced).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Database connection lost');
    });

    it('多项目时正确累计 synced 计数', async () => {
      const projects = [
        {
          id: 'p1', title: 'P1', local_uri: '', duration_ms: 1000,
          source_type: 'video', has_audio: true,
          created_at: 1700000000000, updated_at: 1700000000000,
        },
        {
          id: 'p2', title: 'P2', local_uri: '', duration_ms: 2000,
          source_type: 'audio', has_audio: true,
          created_at: 1700000000000, updated_at: 1700000000000,
        },
      ];

      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1' } },
        error: null,
      });
      getDatabase.mockResolvedValue({});
      getAllProjects.mockResolvedValue(projects);
      getSegmentsByProject
        .mockResolvedValueOnce([
          { id: 's1', project_id: 'p1', order_index: 0, start_ms: 0, end_ms: 500, text: 'a', confidence: null, skip_type: null, source: 'manual', status: 'pending', created_at: 1700000000000, updated_at: 1700000000000 },
        ])
        .mockResolvedValueOnce([]);

      const result = await syncToCloud();

      // p1: 1 project + 1 segment = 2; p2: 1 project = 1; total = 3
      expect(result.synced).toBe(3);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================
  // syncFromCloud
  // ============================
  describe('syncFromCloud', () => {
    it('用户未登录时返回错误', async () => {
      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const result = await syncFromCloud();

      expect(result.pulled).toBe(0);
      expect(result.errors).toContain('Not logged in');
    });

    it('用户已登录但 MVP 占位实现返回 pulled=0', async () => {
      const supabase = getSupabase();
      supabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      const result = await syncFromCloud();

      expect(result.pulled).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});

// ============================
// 未配置 Supabase 的场景
// ============================
describe('sync service — 未配置环境', () => {
  let originalUrl: string | undefined;
  let originalKey: string | undefined;

  beforeAll(() => {
    originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    jest.resetModules();
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('getSupabase 无配置时返回 null', () => {
    const { getSupabase } = require('../sync');
    expect(getSupabase()).toBeNull();
  });

  it('isSyncAvailable 未初始化时返回 false', () => {
    const { isSyncAvailable } = require('../sync');
    expect(isSyncAvailable()).toBe(false);
  });

  it('syncToCloud 未配置时返回错误', async () => {
    const { syncToCloud } = require('../sync');
    const result = await syncToCloud();
    expect(result.synced).toBe(0);
    expect(result.errors).toContain('Sync not configured');
  });

  it('syncFromCloud 未配置时返回错误', async () => {
    const { syncFromCloud } = require('../sync');
    const result = await syncFromCloud();
    expect(result.pulled).toBe(0);
    expect(result.errors).toContain('Sync not configured');
  });
});
