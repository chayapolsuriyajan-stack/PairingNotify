import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PairingNotify',
    short_name: 'Pairings',
    description: 'New chess-results pairings on your lock screen.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1B1C1E',
    theme_color: '#1B1C1E',
    // Android: share a chess-results page to the app to open it here.
    share_target: { action: '/t', method: 'GET', params: { url: 'url', text: 'text', title: 'title' } },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
