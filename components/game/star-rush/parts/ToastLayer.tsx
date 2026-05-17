"use client";

import { AnimatePresence, motion } from "framer-motion";

import styles from "@/styles/starrush.module.css";

import { TOAST_EASE, type ToastState } from "../helpers";

export interface ToastLayerProps {
  toast: ToastState | null;
}

export function ToastLayer({ toast }: ToastLayerProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {toast ? (
        <div className={styles.toastLayer}>
          <motion.div
            key={toast.id}
            className={styles.toastMotion}
            initial={{ opacity: 0, y: -18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.985 }}
            transition={{ duration: 0.24, ease: TOAST_EASE }}
          >
            <div className={styles.toast}>{toast.message}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
