// Solana Mobile config. Everything here is public (EXPO_PUBLIC_*) — no keys.
// devnet while building; switch EXPO_PUBLIC_SOLANA_CLUSTER=mainnet-beta and a
// dedicated RPC URL for the dApp Store release.
import type { AppIdentity } from '@wallet-ui/react-native-kit';

type ClusterName = 'devnet' | 'testnet' | 'mainnet-beta';

const clusterName = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER || 'devnet') as ClusterName;

const DEFAULT_RPC: Record<ClusterName, string> = {
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
};

// Chain identifier the wallet is asked to authorize for (MWA / wallet-standard).
const CHAIN_ID: Record<ClusterName, `solana:${string}`> = {
  devnet: 'solana:devnet',
  testnet: 'solana:testnet',
  'mainnet-beta': 'solana:mainnet',
};

export const CLUSTER = {
  name: clusterName,
  id: CHAIN_ID[clusterName],
  url: process.env.EXPO_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC[clusterName],
};

// Shown in the wallet's approval sheet (Seed Vault, Phantom, Solflare). `uri`
// must be https and `icon` is resolved relative to it — host a real icon at
// this path before shipping. Also the SIWS domain Supabase validates against.
// The site is the repo's GitHub Pages; the trailing slash keeps `icon` under it.
export const APP_URI = 'https://qzmalekuz.github.io/bonkbow/';
export const APP_IDENTITY: AppIdentity = {
  name: 'Bonk Bow',
  uri: APP_URI,
  icon: 'favicon.ico',
};

// SKR — the Seeker ecosystem token (SPL, 6 decimals). Verified against mainnet
// getTokenSupply on 2026-09-29 and docs.solanamobile.com/solana-mobile-stack/skr.
// On devnet there is no SKR, so create any 6-decimal test mint and set
// EXPO_PUBLIC_SKR_MINT to it (the edge function reads its own SKR_MINT secret).
export const SKR_MAINNET_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const SKR_DECIMALS = 6;
export const SKR_MINT =
  process.env.EXPO_PUBLIC_SKR_MINT || (clusterName === 'mainnet-beta' ? SKR_MAINNET_MINT : '');

// Wallet that receives skin payments (SOL and SKR). Public key only.
export const TREASURY_ADDRESS = process.env.EXPO_PUBLIC_TREASURY_ADDRESS || '';

export const SHOP_ENABLED = TREASURY_ADDRESS.length > 0;
export const SKR_ENABLED = SHOP_ENABLED && SKR_MINT.length > 0;

export const shortAddress = (address: string, chars = 4) =>
  address.length <= chars * 2 + 1 ? address : `${address.slice(0, chars)}…${address.slice(-chars)}`;
