import { useEffect, useState } from 'react';

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
      <div className="recommendation-card__poster recommendation-card__poster--placeholder" aria-label="海报加载中">
        <span className="recommendation-card__spinner" />
      </div>
    );
  }

  return (
    <>
      {!loaded ? (
        <div className="recommendation-card__poster recommendation-card__poster--placeholder" aria-label="海报加载中">
          <span className="recommendation-card__spinner" />
        </div>
      ) : null}
      <img
        src={src}
        alt={alt}
        className={`recommendation-card__poster ${loaded ? '' : ' recommendation-card__poster--hidden'}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}
