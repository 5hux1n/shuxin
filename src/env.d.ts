/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    owner: {
      id: number;
      username: string;
      displayName: string;
      bio: string;
      avatarId: string | null;
    } | null;
    csrf: string;
    nonce: string;
  }
}

declare module "*.sql?raw" {
  const sql: string;
  export default sql;
}
