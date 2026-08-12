/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_ADMIN: string
  readonly VITE_MOBILE: string
  readonly VITE_OPERATOR_API_URL?: string
  readonly VITE_OPERATOR_RELEASE_STAGE?: 'core' | 'full'
  readonly VITE_ESV_MOBILE_LICENSED?: string
  readonly VITE_OPERATOR_CAPTURE_DEVICE?: 'tablet'
  readonly VITE_OPERATOR_CAPTURE_AUTORUN?: string
  readonly VITE_OPERATOR_CAPTURE_OPEN_LATEST?: 'sermon'
  readonly VITE_OPERATOR_CAPTURE_HIDE_COMMENTARY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
