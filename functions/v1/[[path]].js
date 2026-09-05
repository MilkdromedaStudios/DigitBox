import deepforgeWorker from "../../cloudflare/deepforge-worker/src/index.js";

export async function onRequest(context) {
  return deepforgeWorker.fetch(context.request, context.env, context);
}
