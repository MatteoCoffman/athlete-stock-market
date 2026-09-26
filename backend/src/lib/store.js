import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function emptyStore() {
  return {
    users: {},
    players: {},
    holdings: {},
    trades: [],
  };
}

export function loadStore() {
  if (!fs.existsSync(STORE_PATH)) {
    return emptyStore();
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

export function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function withStore(mutator) {
  const store = loadStore();
  const result = mutator(store);
  saveStore(store);
  return result;
}

export { STORE_PATH };
