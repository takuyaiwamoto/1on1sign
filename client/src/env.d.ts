/// <reference types="vite/client" />

declare const __BUILD_TIME__: string;

declare module '*.svg' {
  const content: string;
  export default content;
}
