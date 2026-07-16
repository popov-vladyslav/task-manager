import type {
  Comment,
  Context,
  CreateTaskInput,
  ReorderInput,
  Task,
  UpdateTaskInput,
} from '@task-manager/shared';
import { API_URL } from './config';
import { useAuthStore } from '../store/auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const jwt = useAuthStore.getState().jwt;
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    return fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await send();

  // On 401, attempt a single refresh then retry.
  if (res.status === 401) {
    const refreshed = await useAuthStore.getState().tryRefresh();
    if (refreshed) {
      res = await send();
    } else {
      await useAuthStore.getState().signOut();
      throw new ApiError(401, 'Session expired');
    }
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export const api = {
  listContexts: () => request<Context[]>('/api/contexts'),
  listTasks: (params?: { context?: number; status?: string }) =>
    request<Task[]>(`/api/tasks${qs(params)}`),
  createTask: (input: CreateTaskInput) => request<Task>('/api/tasks', { method: 'POST', body: input }),
  updateTask: (id: string, patch: UpdateTaskInput) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  reorderTask: (id: string, input: ReorderInput) =>
    request<Task>(`/api/tasks/${id}/reorder`, { method: 'POST', body: input }),
  listComments: (taskId: string) => request<Comment[]>(`/api/tasks/${taskId}/comments`),
  addComment: (taskId: string, body: string) =>
    request<Comment>(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { body } }),
  deleteComment: (id: string) => request<void>(`/api/comments/${id}`, { method: 'DELETE' }),
  registerPush: (token: string, device?: string) =>
    request<{ ok: boolean }>('/api/push/register', { method: 'POST', body: { token, device } }),
};
