import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { toast } from "@/store/toast";

/**
 * 行内编辑提交前的校验结果。
 * `discard`：空或未改，直接退出编辑；`confirm`：弹出二次确认；`invalid`：toast 后留在编辑态。
 */
export type ConfirmableValidateResult =
  | {
      /** 丢弃本次编辑并恢复原值。 */
      type: "discard";
    }
  | {
      /** 可以弹出二次确认。 */
      type: "confirm";
    }
  | {
      /** 不合法，不关编辑。 */
      type: "invalid";
      /** 展示给用户的错误文案。 */
      message: string;
    };

interface UseConfirmableEditOptions {
  /** 当前已保存的值；非编辑态会用来同步输入框。 */
  value: string;
  /** 变化时中止编辑（例如切到另一条会话）。 */
  resetKey?: string;
  /** 为 false 时 `beginEdit` 无效。 */
  enabled?: boolean;
  /**
   * 对 trim 后的草稿做校验。
   *
   * @param draft 去掉首尾空白后的输入
   */
  validate: (draft: string) => ConfirmableValidateResult;
  /**
   * 用户在 Popover 里点确认后写入。失败请抛错，编辑态会保留以便重试。
   *
   * @param draft 去掉首尾空白后的输入
   */
  commit: (draft: string) => Promise<void>;
}

interface UseConfirmableEditResult {
  /** 包住输入框 / 展示值，点外部判定和 Popover 锚点都用它。 */
  slotRef: RefObject<HTMLDivElement>;
  editing: boolean;
  confirming: boolean;
  saving: boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  beginEdit: () => void;
  cancelEdit: () => void;
  askConfirm: () => ConfirmableValidateResult;
  commitEdit: () => Promise<void>;
}

/**
 * 行内编辑：回车或点组件外才二次确认，确认后才 `commit`。
 * 不要在输入框 `onBlur` 上收口——Strict Mode 会把刚挂上的输入框卸掉再挂，blur 会把编辑立刻取消。
 *
 * @example
 * const edit = useConfirmableEdit({
 *   value: "科幻片",
 *   resetKey: "conv-1",
 *   validate: (draft) => {
 *     if (!draft || draft === "科幻片") return { type: "discard" };
 *     if (draft.length > 120) return { type: "invalid", message: "太长" };
 *     return { type: "confirm" };
 *   },
 *   commit: async (draft) => { await save(draft); },
 * });
 * // beginEdit() 后 editing 为 true；回车后 confirming 为 true；确认后 editing 为 false
 */
export function useConfirmableEdit({
  value,
  resetKey,
  enabled = true,
  validate,
  commit,
}: UseConfirmableEditOptions): UseConfirmableEditResult {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(value);

  const slotRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const cancelledRef = useRef(false);
  const committingRef = useRef(false);
  const confirmingRef = useRef(false);
  const suppressOutsideRef = useRef(false);
  const saveGen = useRef(0);
  const validateRef = useRef(validate);
  const commitRef = useRef(commit);
  const askConfirmRef = useRef<() => ConfirmableValidateResult>(() => ({
    type: "discard",
  }));

  draftRef.current = draft;
  valueRef.current = value;
  validateRef.current = validate;
  commitRef.current = commit;

  const cancelEdit = useCallback(() => {
    cancelledRef.current = true;
    committingRef.current = false;
    confirmingRef.current = false;
    suppressOutsideRef.current = false;
    setConfirming(false);
    setEditing(false);
    setSaving(false);
    setDraft(valueRef.current);
  }, []);

  const skipReset = useRef(true);
  useEffect(() => {
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
    saveGen.current += 1;
    cancelEdit();
  }, [resetKey, cancelEdit]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const applyValidateResult = useCallback(
    (result: ConfirmableValidateResult): ConfirmableValidateResult => {
      if (cancelledRef.current || committingRef.current || confirmingRef.current) {
        return result;
      }
      if (result.type === "discard") {
        cancelEdit();
        return result;
      }
      if (result.type === "invalid") {
        toast.error(result.message);
        return result;
      }
      confirmingRef.current = true;
      setConfirming(true);
      return result;
    },
    [cancelEdit],
  );

  const askConfirm = useCallback((): ConfirmableValidateResult => {
    if (cancelledRef.current || committingRef.current || confirmingRef.current) {
      return { type: "discard" };
    }
    return applyValidateResult(validateRef.current(draftRef.current.trim()));
  }, [applyValidateResult]);

  askConfirmRef.current = askConfirm;

  const beginEdit = useCallback(() => {
    if (!enabled || saving) return;
    cancelledRef.current = false;
    committingRef.current = false;
    confirmingRef.current = false;
    suppressOutsideRef.current = true;
    setConfirming(false);
    setDraft(valueRef.current);
    setEditing(true);
  }, [enabled, saving]);

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      suppressOutsideRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  useEffect(() => {
    if (!editing || confirming) return;

    function onMouseDown(event: MouseEvent) {
      if (suppressOutsideRef.current) return;
      const target = event.target as Node | null;
      if (!target || slotRef.current?.contains(target)) return;

      const result = askConfirmRef.current();
      if (result.type === "confirm" || result.type === "invalid") {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [editing, confirming]);

  const commitEdit = useCallback(async () => {
    if (cancelledRef.current || committingRef.current) return;
    const next = draftRef.current.trim();
    const result = validateRef.current(next);
    if (result.type === "discard") {
      cancelEdit();
      return;
    }
    if (result.type === "invalid") {
      toast.error(result.message);
      return;
    }

    committingRef.current = true;
    const gen = ++saveGen.current;
    setSaving(true);
    try {
      await commitRef.current(next);
      if (gen !== saveGen.current) return;
      confirmingRef.current = false;
      setConfirming(false);
      setEditing(false);
      setDraft(next);
    } catch {
      if (gen !== saveGen.current) return;
    } finally {
      if (gen === saveGen.current) {
        committingRef.current = false;
        setSaving(false);
      }
    }
  }, [cancelEdit]);

  return {
    slotRef,
    editing,
    confirming,
    saving,
    draft,
    setDraft,
    beginEdit,
    cancelEdit,
    askConfirm,
    commitEdit,
  };
}
