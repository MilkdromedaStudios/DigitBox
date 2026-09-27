// Version metadata for the DigitBox Eaglercraft hub.
//
// Game binaries/assets are intentionally not stored here. A version becomes
// launchable automatically when a legally distributable web build exists at
// public/eaglercraft-builds/<slug>/index.html.

export const eaglercraftVersions = [
  {
    slug: "1.12.2",
    name: "Eaglercraft 1.12.2",
    minecraftVersion: "1.12.2",
    channel: "major",
    note: "Modern major Eaglercraft branch.",
    sourceUrl: "https://github.com/Eaglercraft-Archive/unminified-eaglercraft-builds-1.12",
  },
  {
    slug: "1.8.8",
    name: "EaglercraftX 1.8.8",
    minecraftVersion: "1.8.8",
    channel: "major",
    note: "EaglercraftX branch with broad server support.",
    sourceUrl: "https://github.com/Eaglercraft-Archive/Eaglercraftx-1.8.8-src",
  },
  {
    slug: "1.5.2",
    name: "Eaglercraft 1.5.2",
    minecraftVersion: "1.5.2",
    channel: "major",
    note: "Original major Eaglercraft branch; Service Pack builds also use this slot.",
    sourceUrl: "https://github.com/Eaglercraft-Archive/Eaglercraft-SP2-1.5-src",
  },
  {
    slug: "1.6.4",
    name: "Eaglercraft 1.6.4",
    minecraftVersion: "1.6.4",
    channel: "community",
    note: "Community/legacy port. Add only a build you have permission to redistribute.",
  },
  {
    slug: "beta-1.7.3",
    name: "Eaglercraft Beta 1.7.3",
    minecraftVersion: "Beta 1.7.3",
    channel: "community",
    note: "Community/legacy port.",
  },
  {
    slug: "beta-1.3",
    name: "Eaglercraft Beta 1.3",
    minecraftVersion: "Beta 1.3",
    channel: "community",
    note: "Community/legacy port.",
  },
  {
    slug: "alpha-1.2.6",
    name: "Eaglercraft Alpha 1.2.6",
    minecraftVersion: "Alpha 1.2.6",
    channel: "community",
    note: "Community/legacy port.",
  },
  {
    slug: "indev",
    name: "Eaglercraft Indev",
    minecraftVersion: "Indev",
    channel: "community",
    note: "Community/legacy port.",
  },
];

export function eaglercraftEntryPath(slug) {
  return `/eaglercraft-builds/${slug}/index.html`;
}
