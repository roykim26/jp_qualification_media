/**
 * 首页ヒーロー画像のレスポンシブ配信。原図 PNG（1983×793 / 1.7MB）から
 * AVIF / WebP の 3 サイズを生成済みで、非対応ブラウザのみ PNG にフォールバックする。
 */
const heroWidths = [800, 1200, 1983] as const;

export const heroImageSizes =
  '(max-width: 767px) calc(100vw - 32px), (max-width: 1264px) calc(100vw - 64px), 1200px';

function heroSrcset(extension: 'avif' | 'webp'): string {
  return heroWidths
    .map((width) => `/images/hero-${width}.${extension} ${width}w`)
    .join(', ');
}

export const heroImageMarkup = `<picture><source type="image/avif" srcset="${heroSrcset(
  'avif',
)}" sizes="${heroImageSizes}"><source type="image/webp" srcset="${heroSrcset(
  'webp',
)}" sizes="${heroImageSizes}"><img class="home-hero__image" src="/images/exam-information-workspace-hero.png" alt="" width="1983" height="793" decoding="async" fetchpriority="high"></picture>`;

export const heroImagePreload = `<link rel="preload" as="image" type="image/avif" media="(min-width: 768px)" imagesrcset="${heroSrcset(
  'avif',
)}" imagesizes="${heroImageSizes}" fetchpriority="high">`;
