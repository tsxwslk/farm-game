const images = import.meta.glob('../prototype/pixel-farm/assets/**/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function assetUrl(file: string) {
  return images['../prototype/pixel-farm/' + file];
}
