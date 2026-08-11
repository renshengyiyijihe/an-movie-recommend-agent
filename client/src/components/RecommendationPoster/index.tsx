import { useEffect, useState } from 'react';
import styles from './index.module.less';

interface Props {
  src?: string;
  alt: string;
}

export default function RecommendationPoster({ src, alt }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`${styles.posterPlaceholder}`} aria-label="海报加载中">
        <span className={styles.spinner} />
      </div>
    );
  }

  return (
    <>
      {!loaded ? (
        <div className={styles.posterPlaceholder} aria-label="海报加载中">
          <span className={styles.spinner} />
        </div>
      ) : null}
      <img
        src={src}
        alt={alt}
        className={`${styles.poster} ${loaded ? '' : styles.hidden}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}
