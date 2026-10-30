/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc } from 'viem/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { ConnectKitProvider, getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

export { ConnectKitProvider }

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, 'https://rpc.mainnet.arc.io')

const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

export const config = createConfig(
  getDefaultConfig({
    chains: [arc, mainnet],
    transports: {
      [arc.id]: http('https://rpc.mainnet.arc.io'),
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
