import { useCallback, useEffect, useState } from "react";
import useAuth from "@/store/auth";

/**
 * 输入区草稿和可选图片。预览只留在输入区，不进 `messages`。
 * 换号时自行清空；发送开始 / 结束由页面调用 `clearDraftAndFile` / `clearImageData`。
 */
export function useComposer() {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageData, setImageData] = useState("");
  const userId = useAuth((s) => s.user?.id ?? null);

  useEffect(() => {
    if (!file) {
      setImagePreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled) setImageData(reader.result as string);
    };
    reader.readAsDataURL(file);

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const reset = useCallback(() => {
    setDraft("");
    setFile(null);
    setImageData("");
  }, []);

  const clearDraftAndFile = useCallback(() => {
    setDraft("");
    setFile(null);
  }, []);

  const clearImageData = useCallback(() => {
    setImageData("");
  }, []);

  useEffect(() => {
    reset();
  }, [userId, reset]);

  return {
    draft,
    setDraft,
    setFile,
    imagePreview,
    imageData,
    reset,
    clearDraftAndFile,
    clearImageData,
  };
}
