import { useState, useEffect } from 'react'

export interface AssetImages {
  people: Record<string, string>  // slug → file:// URL
  cities: Record<string, string>
}

// Converts a name to a slug matching the file naming convention
// e.g. "Nebuchadnezzar II" → "nebuchadnezzar-ii"
export function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Tries multiple slug variants to find a match in the asset map
export function findImage(map: Record<string, string>, name: string): string | null {
  const slug = nameToSlug(name)
  if (map[slug]) return map[slug]

  // Try first word only (e.g. "nebuchadnezzar" for "nebuchadnezzar-ii")
  const firstWord = slug.split('-')[0]
  if (firstWord && map[firstWord]) return map[firstWord]

  // Try any key that starts with the slug
  const partial = Object.keys(map).find(k => k.startsWith(slug) || slug.startsWith(k))
  if (partial) return map[partial]

  return null
}

let cachedImages: AssetImages | null = null
const listeners: Array<(imgs: AssetImages) => void> = []

export function useAssetImages(): AssetImages {
  const [images, setImages] = useState<AssetImages>(
    cachedImages ?? { people: {}, cities: {} }
  )

  useEffect(() => {
    if (cachedImages) {
      setImages(cachedImages)
      return
    }

    const api = (window as any).electronAPI
    if (!api?.scanAssetImages) return

    api.scanAssetImages().then((result: AssetImages) => {
      cachedImages = result
      setImages(result)
      listeners.forEach(l => l(result))
    }).catch(() => {})
  }, [])

  return images
}
