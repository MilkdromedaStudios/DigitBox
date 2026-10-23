// Reads a single HTML game from a ZIP archive, including ZIP data hidden
// behind a .png filename or an image prefix. No executable launcher code is used.
const MAX_ARCHIVE_BYTES = 180 * 1024 * 1024;
const MAX_GAME_BYTES = 120 * 1024 * 1024;

export async function extractGameHtml(buffer, expectedName) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 22 || buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("The game archive is missing or too large to load safely.");
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // ZIP end-of-central-directory can have up to 65,535 bytes of comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file does not contain a supported ZIP game.");
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) {
    throw new Error("Multi-disk ZIP archives aren't supported.");
  }
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    throw new Error("ZIP64 archives aren't supported.");
  }
  // ZIPs attached to PNGs can have a prefix absent from their recorded offsets.
  const actualDirectory = eocd - directorySize;
  const prefix = actualDirectory - directoryOffset;
  if (actualDirectory < 0 || prefix < 0) throw new Error("Invalid ZIP directory.");
  let cursor = actualDirectory;
  const htmlEntries = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Corrupt game archive directory.");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const gameSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true) + prefix;
    const after = cursor + 46 + fileNameLength + extraLength + commentLength;
    if (after > bytes.length) throw new Error("Corrupt game archive file list.");
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));
    if (/\.html?$/i.test(name)) htmlEntries.push({ name, method, compressedSize, gameSize, localOffset });
    cursor = after;
  }
  // Do not accidentally launch the ZIP's menu. Prefer the exact game's file.
  const wanted = expectedName.toLowerCase();
  const found = htmlEntries.find((entry) => entry.name.split("/").pop().toLowerCase() === wanted);
  const game = found || (htmlEntries.length === 1 ? htmlEntries[0] : null);
  if (!game) throw new Error("Could not find this game's HTML inside its archive.");
  if (game.gameSize > MAX_GAME_BYTES || game.compressedSize > MAX_ARCHIVE_BYTES) {
    throw new Error("The game is too large to unpack in your browser.");
  }
  const offset = game.localOffset;
  if (offset < 0 || offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error("Corrupt game file header.");
  }
  const dataOffset = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
  if (dataOffset + game.compressedSize > bytes.length) throw new Error("Incomplete game file.");
  const data = bytes.subarray(dataOffset, dataOffset + game.compressedSize);
  let htmlBytes;
  if (game.method === 0) {
    htmlBytes = data;
  } else if (game.method === 8) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Your browser cannot decompress ZIP games. Try an updated browser.");
    }
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      htmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      throw new Error("Could not decompress this game.");
    }
  } else {
    throw new Error("This game's ZIP compression isn't supported.");
  }
  if (htmlBytes.byteLength > MAX_GAME_BYTES) throw new Error("The unpacked game is too large.");
  return new TextDecoder("utf-8").decode(htmlBytes);
}
