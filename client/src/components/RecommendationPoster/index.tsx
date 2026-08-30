import { useEffect, useState } from "react";
import classNames from "classnames";
import LocalMoviesOutlined from "@mui/icons-material/LocalMoviesOutlined";
import { TEXT } from "@/constant";
import styles from "./index.module.less";

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
      <div className={styles.posterPlaceholder}>
        <LocalMoviesOutlined className={styles.emptyIcon} aria-hidden />
        <span>{TEXT.chat.posterUnavailable}</span>
      </div>
    );
  }

  return (
    <>
      {!loaded ? (
        <div
          className={styles.posterPlaceholder}
          aria-label={TEXT.chat.posterLoading}
        >
          <span className={styles.spinner} />
        </div>
      ) : null}
      <img
        src={src}
        alt={alt}
        className={classNames(styles.poster, { [styles.hidden]: !loaded })}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}
