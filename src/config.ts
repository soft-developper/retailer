/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { ConnectKitProvider, getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

export { ConnectKitProvider }

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

export const config = createConfig(
  getDefaultConfig({
    chains: [arcTestnet, mainnet],
    transports: {
      [arcTestnet.id]: http(),
      [mainnet.id]: http(),
    },
    walletConnectProjectId: wcProjectId ?? '',
    appName: 'Retailer',
    appDescription: 'Accept USDC payments via QR code',
    connectors: wcProjectId
      ? [injected(), walletConnect({ projectId: wcProjectId }), coinbaseWallet({ appName: 'Retailer' })]
      : [injected(), coinbaseWallet({ appName: 'Retailer' })],
  }),
)
