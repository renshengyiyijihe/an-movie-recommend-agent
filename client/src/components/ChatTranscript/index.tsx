import classNames from "classnames";
import RecommendationPoster from "@/components/RecommendationPoster";
import { TEXT } from "@/constant";
import {
  chatMessageMovies,
  chatMessageText,
  getRecommendationGenres,
  renderMessageText,
} from "@/utils/chatUtils";
import { getTmdbImage } from "@/utils/tmdb";
import type { ChatMessage, RecommendationItem } from "@/types";
import styles from "./index.module.less";

interface Props {
  messages: ChatMessage[];
}

/**
 * 主聊天和历史详情共用的气泡列表（含推荐海报）。
 * 不含输入框、加载 stage。
 */
export default function ChatTranscript({ messages }: Props) {
  return (
    <div className={styles.transcript}>
      {messages.map((item, index) => {
        const failed = item.kind === "error" || item.kind === "reject";
        return (
          <div
            key={`${item.role}-${item.kind}-${index}`}
            className={classNames(styles.message, {
              [styles.userMessage]: item.role === "user",
              [styles.assistantErrorMessage]: item.role !== "user" && failed,
              [styles.assistantMessage]: item.role !== "user" && !failed,
            })}
          >
            <div className={styles.messageRole}>
              {item.role === "user"
                ? TEXT.chat.userRole
                : failed
                  ? TEXT.chat.assistantErrorRole
                  : TEXT.chat.assistantRole}
            </div>
            <div className={styles.messageText}>
              {item.role === "user"
                ? renderMessageText(chatMessageText(item)).map(
                    (line, lineIndex) => (
                      <p key={`${item.kind}-${index}-${lineIndex}`}>{line}</p>
                    ),
                  )
                : renderAssistantContent(item)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderAssistantContent(item: ChatMessage) {
  const text = chatMessageText(item);
  const movies = chatMessageMovies(item);
  const paragraphs = text
    ? renderMessageText(text).map((line, lineIndex) => (
        <p key={`${item.kind}-${lineIndex}`}>{line}</p>
      ))
    : null;

  if (item.kind !== "recommendation") {
    return paragraphs;
  }

  return (
    <div className={styles.assistantBody}>
      {paragraphs}
      {movies.length > 0 ? (
        <div className={styles.recommendationList}>
          {movies.map((movie, movieIndex) =>
            renderRecommendationCard(movie, movieIndex),
          )}
        </div>
      ) : null}
    </div>
  );
}

function renderRecommendationCard(item: RecommendationItem, index: number) {
  const title = item.name || item.title || item.original_title || "未知电影";
  const subtitle =
    item.original_title && item.original_title !== title
      ? item.original_title
      : "";
  const reason = item.reason || item.summary || item.overview || "暂无说明";
  const releaseDate = item.release_date ? item.release_date : "未知日期";
  const rating =
    typeof item.vote_average === "number"
      ? item.vote_average.toFixed(1)
      : "暂无";
  const voteCount =
    typeof item.vote_count === "number" ? `${item.vote_count}` : "0";
  const popularity =
    typeof item.popularity === "number"
      ? `${item.popularity.toFixed(1)}`
      : "暂无";
  const language = item.original_language || "未知";
  const genres = getRecommendationGenres(item);
  const posterUrl = getTmdbImage(item.poster_url || item.poster_path);

  const cardInner = (
    <div className={styles.recommendationCard}>
      <div className={styles.recommendationCardMedia}>
        <RecommendationPoster src={posterUrl} alt={title} />
      </div>
      <div className={styles.recommendationCardBody}>
        <div className={styles.recommendationCardHeader}>
          <div>
            <h4>{title}</h4>
            {subtitle ? (
              <p className={styles.recommendationCardSubtitle}>{subtitle}</p>
            ) : null}
          </div>
          {item.tmdb_url ? (
            <a
              href={item.tmdb_url}
              target="_blank"
              rel="noreferrer"
              className={styles.recommendationCardLink}
            >
              查看详情
            </a>
          ) : null}
        </div>
        <p
          title={reason}
          className={styles.recommendationCardReason}
          data-tooltip={reason}
          aria-label={reason}
        >
          {reason}
        </p>
        <div
          className={styles.recommendationCardMetaRow}
          aria-label="影片信息"
        >
          <span>上映: {releaseDate}</span>
          <span>评分: {rating}</span>
          <span>评分人数: {voteCount}</span>
          <span>热度: {popularity}</span>
          <span>语言: {language}</span>
          {item.adult ? <span>成人内容</span> : null}
          {item.video ? <span>含视频</span> : null}
        </div>
        {genres.length > 0 ? (
          <div
            className={styles.recommendationCardChipRow}
            aria-label="影片类型"
          >
            <span className={styles.recommendationCardChipLabel}>
              类型：
              {genres.map((genre) => (
                <span key={`${title}-${genre}`}>{genre}</span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (item.tmdb_url) {
    return (
      <a
        href={item.tmdb_url}
        target="_blank"
        rel="noreferrer"
        className={styles.recommendationCardLinkWrap}
        key={`${title}-${index}`}
      >
        {cardInner}
      </a>
    );
  }

  return <div key={`${title}-${index}`}>{cardInner}</div>;
}
