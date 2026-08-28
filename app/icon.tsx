import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#10120f', color: '#c6ff35', fontSize: 28, fontWeight: 800, letterSpacing: '-4px', paddingRight: 4 }}>R/</div>,
    size,
  );
}
