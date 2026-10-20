import { useCallback, useEffect, useState } from "react";
import { LIKES_UPDATED_EVENT, readLikes, toggleLike } from "./likes";
import { likeKey } from "./catalog";

// [likedKeys, toggle(item)] — kept in sync across tabs and components.
export function useLikes() {
  const [likes, setLikes] = useState([]);

  useEffect(() => {
    const sync = () => setLikes(readLikes());
    sync();
    window.addEventListener(LIKES_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LIKES_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((item) => setLikes(toggleLike(likeKey(item))), []);
  return [likes, toggle];
}
