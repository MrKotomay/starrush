"use client";

import styles from "@/styles/starrush.module.css";

export interface ConnectionBannerProps {
  title: string;
  hint: string;
}

export function ConnectionBanner({ title, hint }: ConnectionBannerProps) {
  return (
    <div className={styles.connectionBanner} role="status" aria-live="polite">
      <span className={styles.connectionBannerTitle}>{title}</span>
      <span className={styles.connectionBannerText}>{hint}</span>
    </div>
  );
}
