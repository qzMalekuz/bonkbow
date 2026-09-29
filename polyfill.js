// Solana libraries (@solana/kit, Mobile Wallet Adapter) need Node/browser
// APIs Hermes lacks: WebCrypto (Ed25519 verify, getRandomValues, subtle
// digest) and fast base64. react-native-quick-crypto installs a native
// globalThis.crypto. This file MUST run before any Solana import — hence the
// custom entry in index.js. Native module: needs a dev build, not Expo Go.
import { install } from 'react-native-quick-crypto';

install();
