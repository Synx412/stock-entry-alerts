import {demoMarket} from "./market.mjs";
import {newAccount} from "./broker.mjs";

const builtIn = demoMarket();
export const marketOf = session => session.customMarket ?? builtIn;
export function freshSession(customMarket = null) {
  return {version:1, id:crypto.randomUUID(), customMarket, account:newAccount(customMarket ?? builtIn)};
}

export async function connectDesk() {
  const db = await new Promise((resolve,reject) => {
    const request = indexedDB.open("eleven-desk-paper", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("desk");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error("Browser storage is unavailable. Allow site storage to use the desk."));
  });
  db.onversionchange = () => db.close();
  function transact(change, write) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction("desk",write ? "readwrite" : "readonly");
      const store = tx.objectStore("desk");
      const request = store.get("session");
      let result, failure;
      request.onsuccess = () => {
        try {
          const current = request.result ?? freshSession();
          if (current.version !== 1) throw Error("This session uses an unsupported format.");
          result = change(current) ?? current;
          if (write) store.put(result,"session");
        } catch (err) {
          failure = err;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? Error("The session could not be saved. Check your browser's storage."));
      tx.onerror = () => { /* onabort reports the transaction failure */ };
    });
  }
  return {read:() => transact(s => s,false), initialize:() => transact(s => s,true), write:fn => transact(fn,true)};
}
