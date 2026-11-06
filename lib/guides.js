// Original, hand-maintained help content for DigitBox.
// Keep these guides tied to features that exist in the product; update the
// reviewed date and explanations when the corresponding implementation changes.
export const GUIDES = [
  {
    "slug": "game-saves",
    "title": "How game saves work on DigitBox",
    "description": "Understand DigitBox's beta save panel, what it can capture, and how to back up or restore a supported browser game's progress.",
    "updated": "November 6, 2026",
    "readingTime": "4 min read",
    "intro": "DigitBox includes a beta save tool for some browser games. It is designed to preserve progress that a game stores in browser storage, but it cannot reach every game's save system. This guide explains what the controls do and when they are available.",
    "sections": [
      {
        "heading": "Which games can DigitBox save?",
        "paragraphs": [
          "The save tool works when a game runs inside DigitBox and the browser allows DigitBox to read that game's storage. For supported games, it can capture localStorage and sessionStorage, and it makes a best-effort backup of IndexedDB data. Autosave is a convenience feature, not a guarantee that every game or every kind of progress can be recovered.",
          "Some games run on another website. Browser security prevents DigitBox from reading storage across that site boundary, so those games cannot use DigitBox autosave. A game may also block storage access even when it is displayed inside the player. The save panel explains when saving is unavailable."
        ]
      },
      {
        "heading": "Use the save panel",
        "paragraphs": [
          "Open a game and select Saves in the game toolbar. When the panel says autosave is available, you can leave Autosave while you play enabled. DigitBox checks for changes about every 20 seconds after the game has finished starting.",
          "The panel shows the last captured save time. You can also use Save now before leaving a game. Save now is useful when you have just reached a checkpoint or finished a long session and want to make a fresh backup."
        ],
        "bullets": [
          "Load save restores the stored browser backup when you choose to use it.",
          "Export downloads a save file that you can keep separately.",
          "Import loads a previously exported DigitBox save file for that game.",
          "Reset save clears the stored backup. Use it only when you intend to remove saved progress."
        ]
      },
      {
        "heading": "Where your saves are stored",
        "paragraphs": [
          "DigitBox stores its save backups in this browser on this device. Small backups can also be mirrored in a cookie, while larger data may use IndexedDB. These are local browser storage mechanisms; they are not an account-based cloud-sync service.",
          "That means a save may not appear on another computer or in another browser profile. Clearing site data, using private browsing, or changing browser storage settings can remove or prevent access to a backup. Export important progress before clearing browser data or switching devices."
        ]
      },
      {
        "heading": "If a save is missing",
        "paragraphs": [
          "First, check the save panel's status message. If it says the game is external or storage is blocked, DigitBox cannot create a backup for that session. If autosave is available, wait for the game to finish loading, check the last-saved time, and select Save now before closing the page.",
          "For extra protection, export a save file after a successful save. Keep the file somewhere you can find it, and use Import from the same game's save panel when you need it. Restoring a save reloads the game, so finish or pause your current session before importing or loading."
        ]
      }
    ]
  },
  {
    "slug": "browser-game-help",
    "title": "Browser game troubleshooting: loading, controls and progress",
    "description": "Practical checks for games that do not load, ignore keyboard input, run slowly, or appear to lose progress.",
    "updated": "November 6, 2026",
    "readingTime": "4 min read",
    "intro": "Browser games run inside a page, but each title can use a different engine, input method and save system. These checks help narrow down common problems without assuming every game behaves the same way.",
    "sections": [
      {
        "heading": "A game is stuck loading",
        "paragraphs": [
          "Give the game a moment to load its files, especially on the first visit. Many DigitBox games are delivered separately from the main website, so the game may need to fetch its own assets before the title screen appears.",
          "Check that the browser is online and that the page has not been paused by a sleeping tab. Refresh once if the player is clearly stuck. If the same title repeatedly fails while other pages work, the game file or its upstream host may be temporarily unavailable."
        ]
      },
      {
        "heading": "Keyboard or mouse input is not working",
        "paragraphs": [
          "Click once inside the game area before using the keyboard. This gives the embedded game focus; otherwise the browser page may receive the keystrokes instead. If the game has a title screen or controls menu, use the instructions shown by that game.",
          "Controls are set by each game's creator. DigitBox does not impose one universal key map, and the same genre can use different keys in different games. On touch devices, check whether the game provides touch controls; some titles were designed primarily for a keyboard and mouse."
        ]
      },
      {
        "heading": "Performance is uneven",
        "paragraphs": [
          "Close other demanding tabs and applications, keep the browser up to date, and allow the game a little time after it first opens. Large 3D scenes and games with many effects can require more graphics and memory resources than simple 2D games.",
          "Try a different game to see whether the issue is specific to one title. If only one game has the problem, it may be a limitation of that game or its host rather than a general DigitBox issue."
        ]
      },
      {
        "heading": "Progress did not return",
        "paragraphs": [
          "Not every browser game has a save system. Some save automatically, some require an in-game save action, and others keep progress only for the current session. Check the game's own menu first.",
          "For games with DigitBox save support, open Saves in the toolbar and read the status message. The feature is marked beta and cannot capture data from external websites or storage that the browser blocks. See the guide to game saves for details about local backups and exporting a copy."
        ]
      },
      {
        "heading": "Still having trouble?",
        "paragraphs": [
          "Note the game title, the browser you are using, what you expected to happen, and the exact message shown by the player. You can report a reproducible site issue through the DigitBox GitHub issue tracker. Do not include passwords, private account details, or personal information in a public report."
        ]
      }
    ]
  },
  {
    "slug": "minecraft-browser-builds",
    "title": "Choosing a Minecraft browser build",
    "description": "A guide to the unofficial browser-based Minecraft launcher on DigitBox, its build categories, and compatibility caveats.",
    "updated": "November 6, 2026",
    "readingTime": "4 min read",
    "intro": "The DigitBox Minecraft page is an independent directory for browser-based Minecraft community builds. It is not an official Minecraft product, and different builds can have different features, requirements and levels of maintenance.",
    "sections": [
      {
        "heading": "What the launcher lists",
        "paragraphs": [
          "The Minecraft page reads a public community-maintained catalogue and presents available browser builds in one place. The catalogue can change as upstream projects add, rename or remove entries, so the exact selection is not fixed by DigitBox.",
          "The page groups entries into categories such as Vanilla, WASM, Clients, Modpacks and Classic. These labels describe the type of build or package; they do not mean that every entry supports the same features or is compatible with every other entry."
        ]
      },
      {
        "heading": "How to choose an entry",
        "paragraphs": [
          "Start with the version or category you actually need. A vanilla-style build is a different choice from a client or a modpack, and a WASM build may have different browser or device requirements. Read the entry's own description and source information before launching it.",
          "When you are unsure, choose a straightforward build first and confirm that it starts on your device. Change one variable at a time—for example, try another version only after checking that the first entry loaded successfully."
        ]
      },
      {
        "heading": "Compatibility and availability",
        "paragraphs": [
          "Community browser builds are maintained by their respective projects. A build can stop working when its source files move, its host changes, or a browser update affects an older runtime. DigitBox cannot guarantee that every upstream build will remain available or receive updates.",
          "Different versions, clients and modpacks may not connect to the same servers or share the same features. Check the build's project page for compatibility notes rather than assuming that a version number alone guarantees support."
        ]
      },
      {
        "heading": "Unofficial project and attribution",
        "paragraphs": [
          "DigitBox is independent and is not affiliated with, endorsed by, or an official service of Mojang or Microsoft. Minecraft and related marks belong to their respective owners. Community projects retain responsibility for their own builds and documentation.",
          "Use the source or project links provided with an entry to read its current instructions and licensing information. If you are the creator or rights holder of a listed project and need a listing reviewed, contact the site through the DigitBox issue tracker."
        ]
      }
    ]
  }
];

export function getGuide(slug) {
  return GUIDES.find((guide) => guide.slug === slug) || null;
}
