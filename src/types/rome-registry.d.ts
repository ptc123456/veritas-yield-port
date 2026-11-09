declare module "@rome-protocol/registry" {
  export function listChains(): any[];
  export function getChain(chainIdOrName: number | string): any;
  export function getTokens(chainIdOrName: number | string): any[];
  export function getContracts(chainIdOrName: number | string): Record<string, string>;
  export function getPrograms(network: "devnet" | "mainnet" | string): Record<string, string>;
  export function getLstMints(): Record<string, any>;
}
