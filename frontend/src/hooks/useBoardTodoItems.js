import { useCallback, useEffect, useMemo, useState } from "react";
import { DIFFICULTY_XP, TODO_DIFFICULTY_OPTIONS, TODO_STATUS_OPTIONS } from "../constants/todoBoardConstants";
import { apiRequest } from "../utils/apiClient";

const EDITABLE_FIELDS = new Set(["title", "difficulty", "status"]);

function normalizeDifficulty(value) {
  return TODO_DIFFICULTY_OPTIONS.includes(value) ? value : "Easy";
}

function normalizeStatus(value) {
  return TODO_STATUS_OPTIONS.includes(value) ? value : "Not Started";
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const id = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : createItemId();
  return {
    id,
    title: typeof item.title === "string" ? item.title : "",
    difficulty: normalizeDifficulty(item.difficulty),
    position: Number.isFinite(item.position) ? item.position : 0,
    status: normalizeStatus(item.status),
  };
}

function createItemId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortByPositionThenId(items) {
  return [...items].sort((a, b) => {
    const diff = (a.position ?? 0) - (b.position ?? 0);
    return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
  });
}

export function useBoardTodoItems() {
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [items, setItems] = useState([]);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsHydrating(true);
      try {
        const data = await apiRequest("/api/tasks");
        if (!isMounted) return;
        const normalized = (data.tasks || [])
          .map(normalizeItem)
          .filter((item) => item && item.status !== "Done");
        setItems(normalized);
      } catch {
        if (isMounted) setItems([]);
      } finally {
        if (isMounted) setIsHydrating(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, []);

  const deleteItem = useCallback(async (idToDelete) => {
    const deleted = items.find((item) => item.id === idToDelete);
    if (!deleted) return;
    setItems((prev) => prev.filter((item) => item.id !== idToDelete));
    try {
      await apiRequest(`/api/tasks/${idToDelete}`, { method: "DELETE" });
    } catch {
      setItems((prev) => {
        if (prev.some((item) => item.id === idToDelete)) return prev;
        return sortByPositionThenId([...prev, deleted]);
      });
    }
  }, [items]);

  const updateItem = useCallback(async (idToUpdate, fieldName, value) => {
    if (!EDITABLE_FIELDS.has(fieldName)) return;

    if (fieldName === "status" && value === "Done") {
      setItems((prev) => prev.filter((item) => item.id !== idToUpdate));
      try {
        await apiRequest(`/api/tasks/${idToUpdate}`, { method: "DELETE" });
      } catch { /* keep removed from UI */ }
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === idToUpdate
          ? { ...item, [fieldName]: fieldName === "difficulty" ? normalizeDifficulty(value) : String(value) }
          : item,
      ),
    );
    try {
      await apiRequest(`/api/tasks/${idToUpdate}`, { method: "PATCH", body: { [fieldName]: value } });
    } catch { /* optimistic update stays */ }
  }, []);

  const addItem = useCallback(async () => {
    const optimisticId = `optimistic-${createItemId()}`;
    const optimisticItem = { id: optimisticId, title: "", difficulty: "Easy", position: items.length + 1, status: "Not Started" };
    setItems((prev) => [...prev, optimisticItem]);
    try {
      const data = await apiRequest("/api/tasks", {
        method: "POST",
        body: { title: "", difficulty: "Easy", status: "Not Started" },
      });
      const persisted = normalizeItem(data.task);
      if (!persisted) throw new Error("Failed to normalize task");
      setItems((prev) =>
        prev.map((item) => item.id === optimisticId ? { ...item, id: persisted.id, position: persisted.position } : item),
      );
    } catch {
      setItems((prev) => prev.filter((item) => item.id !== optimisticId));
    }
  }, [items.length]);

  const handleDragStart = useCallback((id) => setDraggedItemId(id), []);
  const handleDragOver = useCallback((e) => e.preventDefault(), []);
  const handleDragEnd = useCallback(() => setDraggedItemId(null), []);

  const handleDrop = useCallback(async (targetId) => {
    if (!draggedItemId || draggedItemId === targetId) return;
    setItems((prev) => {
      const from = prev.findIndex((item) => item.id === draggedItemId);
      const to = prev.findIndex((item) => item.id === targetId);
      if (from === -1 || to === -1) return prev;
      const reordered = [...prev];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      return reordered;
    });
    try {
      await apiRequest(`/api/tasks/${draggedItemId}`, {
        method: "PATCH",
        body: { position: items.findIndex((i) => i.id === targetId) + 1 },
      });
    } catch { /* keep reorder */ }
  }, [draggedItemId, items]);

  return useMemo(() => ({
    addItem, deleteItem, draggedItemId,
    handleDragEnd, handleDragOver, handleDragStart, handleDrop,
    isHydrating, isReady: !isHydrating, items, updateItem,
  }), [addItem, deleteItem, draggedItemId, handleDragEnd, handleDragOver, handleDragStart, handleDrop, isHydrating, items, updateItem]);
}
