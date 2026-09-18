import type { components } from './schema.generated'

export type Owner = components['schemas']['Owner']
export type OwnerSession = components['schemas']['OwnerSession']
export type LoginResult = components['schemas']['LoginResult']

export interface LoginInput {
  email: string
  password: string
  redirectTo?: string
}

export class AuthenticationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function xsrfToken(): string | null {
  const encodedToken = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length)

  return encodedToken ? decodeURIComponent(encodedToken) : null
}

async function unsafeRequest(path: string, body?: object): Promise<Response> {
  const token = xsrfToken()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  if (token) headers['X-XSRF-TOKEN'] = token

  return fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

export async function getSession(): Promise<OwnerSession | null> {
  const response = await fetch('/api/v1/session', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  if (response.status === 401 || response.status === 403) return null
  if (!response.ok) throw new AuthenticationError('Không thể kiểm tra phiên đăng nhập.', response.status)

  return (await response.json()) as OwnerSession
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const csrfResponse = await fetch('/sanctum/csrf-cookie', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  if (!csrfResponse.ok) {
    throw new AuthenticationError('Không thể khởi tạo phiên đăng nhập.', csrfResponse.status)
  }

  const response = await unsafeRequest('/login', {
    email: input.email,
    password: input.password,
    redirect_to: input.redirectTo,
  })

  if (!response.ok) {
    if (response.status === 419) {
      throw new AuthenticationError('Phiên bảo mật đã hết hạn. Vui lòng thử lại.', response.status)
    }
    throw new AuthenticationError('Email hoặc mật khẩu không hợp lệ.', response.status)
  }

  return (await response.json()) as LoginResult
}

export async function logout(): Promise<void> {
  const response = await unsafeRequest('/logout')

  if (!response.ok && response.status !== 401) {
    if (response.status === 419) {
      throw new AuthenticationError('Phiên bảo mật đã hết hạn. Vui lòng thử lại.', response.status)
    }
    throw new AuthenticationError('Không thể đăng xuất an toàn.', response.status)
  }
}
