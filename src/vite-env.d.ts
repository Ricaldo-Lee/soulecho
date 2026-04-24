/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GUACI_CARD_URL?: string;
  readonly VITE_GUACI_CARD_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
