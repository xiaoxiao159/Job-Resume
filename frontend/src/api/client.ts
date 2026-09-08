/**
 * HTTP 客户端封装 —— 06-frontend-design §4.1。
 * · envelope 解包（04 §2.2）：单资源 → data，列表 → data + meta
 * · 错误统一 ApiError { status, code, message, details[] }（04 §2.2/§6）
 * · snake_case 原样直传，零映射（04 §2.1）
 * · USE_MOCK：withMock 在 api 域文件中按函数分流（06 §4.5）
 */
import type { ListResponse, PageMeta } from './types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export interface FieldError {
  field?: string;
  message: string;
  code?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: FieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  /** 422 details → 字段级错误表（03 §4.4 就地错误映射用） */
  get fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const d of this.details ?? []) {
      if (d.field) map[d.field] = d.message;
    }
    return map;
  }
}

/** Mock 分流：USE_MOCK 为真时整个项目走 mock 实现，换后端只改 .env 开关。
 *  统一返回 Promise（后端本就全异步；mock 实现可能同步返回，这里归一） */
export function withMock<A extends unknown[], R>(
  mock: (...args: A) => R | Promise<R>,
  real: (...args: A) => R | Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A) => Promise.resolve(USE_MOCK ? mock(...args) : real(...args));
}

function toQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  body?: unknown;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
}

interface Envelope<T> {
  data: T;
  meta?: PageMeta;
  links?: Record<string, string>;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'internal_error';
  let message = `请求失败（${res.status}）`;
  let details: FieldError[] | undefined;
  try {
    const j = await res.json();
    if (j?.error) {
      code = j.error.code ?? code;
      message = j.error.message ?? message;
      details = j.error.details;
    }
  } catch {
    // 非 JSON 错误体，沿用默认
  }
  return new ApiError(res.status, code, message, details);
}

async function httpJson<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}${toQuery(opts.params)}`, {
    method,
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

/** 单资源 GET（envelope 解包） */
export async function apiGet<T>(path: string, opts?: RequestOptions): Promise<T> {
  const j = await httpJson<Envelope<T>>('GET', path, opts);
  return j.data;
}

/** 列表 GET（返回 data + meta，04 §2.2 列表封装） */
export async function apiList<T>(path: string, opts?: RequestOptions): Promise<ListResponse<T>> {
  return httpJson<ListResponse<T>>('GET', path, opts);
}

/** POST / PUT / PATCH（envelope 解包） */
export async function apiSend<T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown): Promise<T> {
  const j = await httpJson<Envelope<T>>(method, path, { body });
  return j.data;
}

export async function apiDelete(path: string): Promise<void> {
  await httpJson<null>('DELETE', path);
}

/**
 * 非 envelope 原始响应（04 §5.4 preview/export：text/文件流，契约 §10.4）。
 * 返回 Response，由调用方决定 text()/blob()。
 */
export async function apiRaw(path: string, opts?: RequestOptions): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}${toQuery(opts?.params)}`, {
    signal: opts?.signal,
    headers: opts?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    method: opts?.body !== undefined ? 'POST' : 'GET',
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  return res;
}